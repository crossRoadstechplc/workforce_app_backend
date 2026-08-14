import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgRole, emitToUser } from "../../realtime/socket.server.js";
import { ROLE, assertSameOrganization } from "../../shared/tenancy.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";
import { formatWorkDateKey, mapFormattedWorkDates, withFormattedWorkDate } from "../../shared/work-date.js";

async function employeeForUser(userId: string) {
  const e = await prisma.employee.findUnique({ where: { userId } });
  if (!e) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
  return e;
}
const range = (from?: Date, to?: Date) => ({
  ...(from || to ? { workDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
});

export const historyService = {
  async myTimesheets(userId: string, input: any) {
    const e = await employeeForUser(userId);
    const where = { employeeId: e.id, ...range(input.from, input.to) };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.timesheet.findMany({
        where,
        orderBy: { workDate: "desc" },
        skip,
        take: input.pageSize,
        include: { lateReason: true, worksheet: { select: { id: true, status: true } } }
      }),
      prisma.timesheet.count({ where })
    ]);
    return { items: mapFormattedWorkDates(items), meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  },
  async myTimesheet(userId: string, id: string) {
    const e = await employeeForUser(userId);
    const item = await prisma.timesheet.findFirst({
      where: { id, employeeId: e.id },
      include: { locations: true, lateReason: true, worksheet: true, corrections: true }
    });
    if (!item) throw new AppError(404, "TIMESHEET_NOT_FOUND", "Timesheet not found");
    return withFormattedWorkDate(item);
  },
  async myTimesheetCalendar(userId: string, year: number, month: number) {
    const e = await employeeForUser(userId);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return mapFormattedWorkDates(
      await prisma.timesheet.findMany({
      where: { employeeId: e.id, workDate: { gte: start, lt: end } },
      orderBy: { workDate: "asc" },
      select: {
        id: true,
        workDate: true,
        status: true,
        actualCheckIn: true,
        actualCheckOut: true,
        workedMinutes: true,
        isLate: true,
        isEarlyCheckout: true,
        isMissingCheckout: true,
        worksheet: { select: { id: true } }
      }
    })
    );
  },
  async myWorksheets(userId: string, input: any) {
    const e = await employeeForUser(userId);
    const where = { employeeId: e.id, ...range(input.from, input.to) };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.worksheet.findMany({
        where,
        orderBy: { workDate: "desc" },
        skip,
        take: input.pageSize,
        include: { timesheet: { select: { actualCheckIn: true, actualCheckOut: true, workedMinutes: true, status: true } } }
      }),
      prisma.worksheet.count({ where })
    ]);
    return { items: mapFormattedWorkDates(items), meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  },
  async myWorksheetCalendar(userId: string, year: number, month: number) {
    const e = await employeeForUser(userId);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return mapFormattedWorkDates(
      await prisma.worksheet.findMany({
      where: { employeeId: e.id, workDate: { gte: start, lt: end } },
      orderBy: { workDate: "asc" },
      select: { id: true, workDate: true, status: true, submittedAt: true }
    })
    );
  },
  async myWorksheet(userId: string, id: string) {
    const e = await employeeForUser(userId);
    const item = await prisma.worksheet.findFirst({ where: { id, employeeId: e.id }, include: { timesheet: true } });
    if (!item) throw new AppError(404, "WORKSHEET_NOT_FOUND", "Worksheet not found");
    return withFormattedWorkDate(item);
  },
  async adminTimesheets(organizationId: string, input: any, scope: OfficeScope) {
    const where = {
      employee: { organizationId, ...employeeOfficeFilter(scope, input.officeId) },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...range(input.from, input.to)
    };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.timesheet.findMany({
        where,
        orderBy: { workDate: "desc" },
        skip,
        take: input.pageSize,
        include: {
          employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
          lateReason: true,
          worksheet: { select: { id: true, status: true } }
        }
      }),
      prisma.timesheet.count({ where })
    ]);
    return { items, meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  },
  async adminTimesheet(organizationId: string, id: string, scope: OfficeScope) {
    const item = await prisma.timesheet.findUnique({
      where: { id },
      include: { employee: true, office: true, schedule: true, locations: true, lateReason: true, worksheet: true, corrections: true }
    });
    if (!item) throw new AppError(404, "TIMESHEET_NOT_FOUND", "Timesheet not found");
    assertSameOrganization(item.employee.organizationId, organizationId, "TIMESHEET_NOT_FOUND", "Timesheet not found");
    assertOfficeInScope(scope, item.officeId, "You do not manage this office");
    return item;
  },
  async correctTimesheet(
    organizationId: string,
    id: string,
    input: { actualCheckIn?: Date; actualCheckOut?: Date; reason: string },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    const current = await this.adminTimesheet(organizationId, id, scope);
    const checkIn = input.actualCheckIn ?? current.actualCheckIn;
    const checkOut = input.actualCheckOut ?? current.actualCheckOut;
    if (!checkOut) throw new AppError(422, "CHECKOUT_REQUIRED", "Correction requires a checkout time");
    if (checkOut <= checkIn) throw new AppError(422, "INVALID_TIME_RANGE", "Checkout must be after check-in");
    const threshold = DateTime.fromJSDate(current.scheduledCheckIn).plus({ minutes: current.scheduleLateGraceMinutes }).toJSDate();
    const lateMinutes = Math.max(0, Math.floor((checkIn.getTime() - threshold.getTime()) / 60000));
    const workedMinutes = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000));
    const early = Math.max(0, Math.floor((current.scheduledCheckOut.getTime() - checkOut.getTime()) / 60000));
    const overtime = Math.max(0, Math.floor((checkOut.getTime() - current.scheduledCheckOut.getTime()) / 60000));
    const status = lateMinutes > 0 ? "COMPLETED_LATE" : "COMPLETED_ON_TIME";
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.timesheet.update({
        where: { id },
        data: {
          actualCheckIn: checkIn,
          actualCheckOut: checkOut,
          lateMinutes,
          workedMinutes,
          earlyCheckoutMinutes: early,
          overtimeMinutes: overtime,
          isLate: lateMinutes > 0,
          isEarlyCheckout: early > 0,
          isOpen: false,
          isMissingCheckout: false,
          status
        }
      });
      await tx.attendanceCorrection.create({
        data: {
          timesheetId: id,
          actorUserId: audit.actorUserId,
          reason: input.reason,
          previousValues: auditJson(current)!,
          correctedValues: auditJson(updated)!
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ATTENDANCE_CORRECTED",
          entityType: "Timesheet",
          entityId: id,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.employee.userId,
          type: "ATTENDANCE_CORRECTED",
          title: "Attendance corrected",
          message: `Your attendance for ${formatWorkDateKey(current.workDate)} was corrected by an administrator.`,
          relatedEntityType: "Timesheet",
          relatedEntityId: id
        }
      });
      return { updated, n };
    });
    await deliverNotification(result.n);
    emitToOrgRole(organizationId, ROLE.ORG_ADMIN, "attendance.corrected", { timesheetId: id, employeeId: current.employeeId });
    return result.updated;
  },
  async adminWorksheets(organizationId: string, input: any, scope: OfficeScope) {
    const where = {
      employee: { organizationId, ...employeeOfficeFilter(scope, input.officeId) },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...range(input.from, input.to)
    };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.worksheet.findMany({
        where,
        orderBy: { workDate: "desc" },
        skip,
        take: input.pageSize,
        include: {
          employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
          timesheet: { select: { workedMinutes: true, status: true } }
        }
      }),
      prisma.worksheet.count({ where })
    ]);
    return { items, meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) } };
  },
  async adminWorksheet(organizationId: string, id: string, scope: OfficeScope) {
    const item = await prisma.worksheet.findUnique({ where: { id }, include: { employee: true, timesheet: true } });
    if (!item) throw new AppError(404, "WORKSHEET_NOT_FOUND", "Worksheet not found");
    assertSameOrganization(item.employee.organizationId, organizationId, "WORKSHEET_NOT_FOUND", "Worksheet not found");
    assertOfficeInScope(scope, item.employee.officeId, "You do not manage this office");
    return item;
  },
  async reviewWorksheet(organizationId: string, id: string, input: { adminComment?: string }, audit: AuditContext, scope: OfficeScope) {
    const current = await this.adminWorksheet(organizationId, id, scope);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.worksheet.update({
        where: { id },
        data: { status: "REVIEWED", reviewedBy: audit.actorUserId, reviewedAt: new Date(), adminComment: input.adminComment }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "WORKSHEET_REVIEWED",
          entityType: "Worksheet",
          entityId: id,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.employee.userId,
          type: "WORKSHEET_REVIEWED",
          title: "Worksheet reviewed",
          message: "Your daily worksheet was reviewed.",
          relatedEntityType: "Worksheet",
          relatedEntityId: id
        }
      });
      return { updated, n };
    });
    await deliverNotification(result.n);
    emitToUser(current.employee.userId, "worksheet.reviewed", { worksheetId: id });
    return result.updated;
  }
};
