import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgRole, emitToUser } from "../../realtime/socket.server.js";
import { ROLE, assertSameOrganization } from "../../shared/tenancy.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";

async function employeeContext(userId: string) {
  const e = await prisma.employee.findUnique({
    where: { userId },
    include: { user: true, office: true, schedule: { include: { days: true } } }
  });
  if (!e || e.status !== "ACTIVE" || e.user.status !== "ACTIVE") throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
  if (!e.schedule) throw new AppError(400, "SCHEDULE_NOT_ASSIGNED", "A work schedule is required");
  return e;
}
function localDate(d: Date, zone: string) {
  return DateTime.fromJSDate(d, { zone: "utc" }).setZone(zone, { keepLocalTime: true }).startOf("day");
}
function scheduleWorkingWeekdays(schedule: NonNullable<Awaited<ReturnType<typeof employeeContext>>["schedule"]>) {
  if (schedule.days.length > 0) return schedule.days.map((d) => d.weekday);
  return schedule.workingDays;
}
function workingDaysBetween(start: Date, end: Date, zone: string, workingDays: number[]) {
  let cur = localDate(start, zone),
    stop = localDate(end, zone);
  if (stop < cur) throw new AppError(422, "INVALID_LEAVE_RANGE", "End date cannot be before start date");
  let count = 0;
  while (cur <= stop) {
    if (workingDays.includes(cur.weekday)) count++;
    cur = cur.plus({ days: 1 });
  }
  return count;
}
function dateBounds(start: Date, end: Date) {
  const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  return { s, e };
}
async function orgAdminUserIds(organizationId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      memberships: { some: { organizationId } },
      userRoles: { some: { role: { name: ROLE.ORG_ADMIN } } }
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

export const leaveService = {
  async types(organizationId: string) {
    return prisma.leaveType.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } });
  },
  async create(userId: string, input: { leaveTypeId: string; startDate: Date; endDate: Date; reason: string }) {
    const e = await employeeContext(userId);
    const type = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!type?.isActive || type.organizationId !== e.organizationId) {
      throw new AppError(400, "INVALID_LEAVE_TYPE", "Leave type does not exist or is inactive");
    }
    const zone = e.office?.timezone ?? e.schedule!.timezone;
    const { s, e: ed } = dateBounds(input.startDate, input.endDate);
    const today = DateTime.now().setZone(zone).startOf("day");
    if (DateTime.fromJSDate(s, { zone: "utc" }) < today.toUTC().startOf("day")) {
      throw new AppError(422, "PAST_LEAVE_NOT_ALLOWED", "Leave cannot start in the past");
    }
    const numberOfDays = workingDaysBetween(s, ed, zone, scheduleWorkingWeekdays(e.schedule!));
    if (numberOfDays <= 0) throw new AppError(422, "NO_WORKING_DAYS", "Selected leave range contains no scheduled working days");
    const overlap = await prisma.leaveRequest.findFirst({
      where: { employeeId: e.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: ed }, endDate: { gte: s } }
    });
    if (overlap) throw new AppError(409, "OVERLAPPING_LEAVE", "Leave overlaps an existing pending or approved request");
    const admins = await orgAdminUserIds(e.organizationId);
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.create({
        data: { employeeId: e.id, leaveTypeId: input.leaveTypeId, startDate: s, endDate: ed, numberOfDays, reason: input.reason },
        include: { leaveType: true }
      });
      const notifications = await Promise.all(
        admins.map((adminId) =>
          tx.notification.create({
            data: {
              userId: adminId,
              type: "LEAVE_SUBMITTED",
              title: "New leave request",
              message: `${e.firstName} ${e.lastName} submitted a leave request.`,
              relatedEntityType: "LeaveRequest",
              relatedEntityId: request.id
            }
          })
        )
      );
      return { request, notifications };
    });
    for (const n of result.notifications) await deliverNotification(n);
    emitToOrgRole(e.organizationId, ROLE.ORG_ADMIN, "leave.requested", {
      leaveRequestId: result.request.id,
      employeeId: e.id,
      status: result.request.status
    });
    return result.request;
  },
  async myList(userId: string, input: any) {
    const e = await employeeContext(userId);
    const where = { employeeId: e.id, ...(input.status ? { status: input.status } : {}) };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.leaveRequest.findMany({
        where,
        include: { leaveType: true, decisions: { orderBy: { decidedAt: "desc" } } },
        orderBy: { requestedAt: "desc" },
        skip,
        take: input.pageSize
      }),
      prisma.leaveRequest.count({ where })
    ]);
    return { items, meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  },
  async myGet(userId: string, id: string) {
    const e = await employeeContext(userId);
    const item = await prisma.leaveRequest.findFirst({
      where: { id, employeeId: e.id },
      include: { leaveType: true, decisions: { orderBy: { decidedAt: "desc" } } }
    });
    if (!item) throw new AppError(404, "LEAVE_NOT_FOUND", "Leave request not found");
    return item;
  },
  async summary(userId: string) {
    const e = await employeeContext(userId);
    const grouped = await prisma.leaveRequest.groupBy({
      by: ["status"],
      where: { employeeId: e.id },
      _count: { _all: true },
      _sum: { numberOfDays: true }
    });
    const result = {
      totalRequests: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
      cancelledRequests: 0,
      approvedDays: 0,
      rejectedDays: 0
    };
    for (const g of grouped) {
      const c = g._count._all;
      result.totalRequests += c;
      if (g.status === "PENDING") result.pendingRequests = c;
      if (g.status === "APPROVED") {
        result.approvedRequests = c;
        result.approvedDays = Number(g._sum.numberOfDays ?? 0);
      }
      if (g.status === "REJECTED") {
        result.rejectedRequests = c;
        result.rejectedDays = Number(g._sum.numberOfDays ?? 0);
      }
      if (g.status === "CANCELLED") result.cancelledRequests = c;
    }
    return result;
  },
  async cancel(userId: string, id: string, reason?: string) {
    const current = await this.myGet(userId, id);
    if (current.status !== "PENDING") throw new AppError(409, "LEAVE_NOT_CANCELLABLE", "Only pending leave can be cancelled by the employee");
    const e = await employeeContext(userId);
    const result = await prisma.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    emitToOrgRole(e.organizationId, ROLE.ORG_ADMIN, "leave.cancelled", { leaveRequestId: id, employeeId: current.employeeId });
    return result;
  },
  async adminList(organizationId: string, input: any, scope: OfficeScope) {
    const where = {
      employee: { organizationId, ...employeeOfficeFilter(scope, input.officeId) },
      ...(input.status ? { status: input.status } : {}),
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.from || input.to
        ? {
            AND: [
              ...(input.from ? [{ endDate: { gte: input.from } }] : []),
              ...(input.to ? [{ startDate: { lte: input.to } }] : [])
            ]
          }
        : {})
    };
    const skip = (input.page - 1) * input.pageSize;
    const countWhere = { employee: { organizationId, ...employeeOfficeFilter(scope, input.officeId) } };
    const [items, total] = await prisma.$transaction([
      prisma.leaveRequest.findMany({
        where,
        include: {
          leaveType: true,
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: true,
              officeId: true,
              office: { select: { id: true, name: true } }
            }
          },
          decisions: { orderBy: { decidedAt: "desc" } }
        },
        orderBy: { requestedAt: "desc" },
        skip,
        take: input.pageSize
      }),
      prisma.leaveRequest.count({ where })
    ]);
    const grouped = await prisma.leaveRequest.groupBy({
      by: ["status"],
      where: countWhere,
      _count: { _all: true },
      orderBy: { status: "asc" }
    });
    const counts = { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const g of grouped) {
      const n = g._count._all;
      counts.total += n;
      if (g.status === "PENDING") counts.pending = n;
      if (g.status === "APPROVED") counts.approved = n;
      if (g.status === "REJECTED") counts.rejected = n;
      if (g.status === "CANCELLED") counts.cancelled = n;
    }
    return { items, meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) }, counts };
  },
  async adminGet(organizationId: string, id: string, scope: OfficeScope) {
    const item = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        leaveType: true,
        employee: { include: { user: true, schedule: true, office: true } },
        decisions: { include: { admin: { select: { id: true, email: true } } }, orderBy: { decidedAt: "desc" } }
      }
    });
    if (!item) throw new AppError(404, "LEAVE_NOT_FOUND", "Leave request not found");
    assertSameOrganization(item.employee.organizationId, organizationId, "LEAVE_NOT_FOUND", "Leave request not found");
    assertOfficeInScope(scope, item.employee.officeId, "You do not manage this office");
    return item;
  },
  async decide(organizationId: string, id: string, decision: "APPROVED" | "REJECTED", reason: string | undefined, audit: AuditContext, scope: OfficeScope) {
    const current = await this.adminGet(organizationId, id, scope);
    if (current.status !== "PENDING") throw new AppError(409, "LEAVE_ALREADY_DECIDED", "Only pending leave can be decided");
    if (decision === "REJECTED" && !reason) throw new AppError(422, "REJECTION_REASON_REQUIRED", "Rejection reason is required");
    if (decision === "APPROVED") {
      const attendance = await prisma.timesheet.findFirst({
        where: { employeeId: current.employeeId, workDate: { gte: current.startDate, lte: current.endDate } }
      });
      if (attendance) throw new AppError(409, "LEAVE_ATTENDANCE_CONFLICT", "Attendance already exists within the requested leave dates");
    }
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({ where: { id }, data: { status: decision } });
      await tx.leaveDecision.create({
        data: { leaveRequestId: id, adminUserId: audit.actorUserId, decision, decisionReason: reason }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: `LEAVE_${decision}`,
          entityType: "LeaveRequest",
          entityId: id,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.employee.userId,
          type: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
          title: decision === "APPROVED" ? "Leave approved" : "Leave rejected",
          message:
            decision === "APPROVED"
              ? "Your leave request was approved."
              : `Your leave request was rejected${reason ? `: ${reason}` : "."}`,
          relatedEntityType: "LeaveRequest",
          relatedEntityId: id
        }
      });
      return { updated, n };
    });
    await deliverNotification(result.n);
    emitToUser(current.employee.userId, decision === "APPROVED" ? "leave.approved" : "leave.rejected", {
      leaveRequestId: id,
      status: decision,
      reason
    });
    emitToOrgRole(organizationId, ROLE.ORG_ADMIN, "leave.decision_updated", { leaveRequestId: id, status: decision });
    return result.updated;
  }
};
