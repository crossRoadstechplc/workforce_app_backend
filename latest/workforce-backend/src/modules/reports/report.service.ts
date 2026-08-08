import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";

function dayBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

function inclusiveRange(from: Date, to: Date) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1));
  return { start, end };
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export const reportService = {
  async recordExport(reportType: string, filters: Record<string, unknown>, audit: AuditContext) {
    await prisma.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "REPORT_EXPORTED", entityType: reportType, entityId: audit.actorUserId, newValues: auditJson(filters), ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
  },
  async today(date: Date, officeId?: string) {
    const { start, end } = dayBounds(date);
    const employeeWhere = { status: "ACTIVE" as const, ...(officeId ? { officeId } : {}) };
    const timesheetWhere = { workDate: { gte: start, lt: end }, ...(officeId ? { officeId } : {}) };

    const [totalEmployees, timesheets, approvedLeaves, worksheetCount, pendingLeaveCount] = await prisma.$transaction([
      prisma.employee.count({ where: employeeWhere }),
      prisma.timesheet.findMany({
        where: timesheetWhere,
        select: {
          employeeId: true,
          status: true,
          isOpen: true,
          isLate: true,
          isMissingCheckout: true,
          actualCheckOut: true,
          worksheet: { select: { id: true } }
        }
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: start },
          endDate: { gte: start },
          employee: employeeWhere
        },
        select: { employeeId: true }
      }),
      prisma.worksheet.count({ where: { workDate: { gte: start, lt: end }, ...(officeId ? { employee: { officeId } } : {}) } }),
      prisma.leaveRequest.count({ where: { status: "PENDING", ...(officeId ? { employee: { officeId } } : {}) } })
    ]);

    const attended = new Set(timesheets.map((x) => x.employeeId));
    const onLeave = new Set(approvedLeaves.map((x) => x.employeeId));
    const checkedIn = timesheets.filter((x) => x.isOpen && !x.isMissingCheckout).length;
    const checkedOut = timesheets.filter((x) => !x.isOpen && !!x.actualCheckOut).length;
    const late = timesheets.filter((x) => x.isLate).length;
    const missingCheckout = timesheets.filter((x) => x.isMissingCheckout).length;
    const onTime = timesheets.filter((x) => !x.isLate).length;
    const absentOrNotCheckedIn = Math.max(0, totalEmployees - new Set([...attended, ...onLeave]).size);

    return {
      date: start.toISOString().slice(0, 10),
      totalEmployees,
      checkedIn,
      checkedOut,
      onTime,
      late,
      onLeave: onLeave.size,
      notCheckedIn: absentOrNotCheckedIn,
      missingCheckout,
      worksheetsSubmitted: worksheetCount,
      pendingLeaveRequests: pendingLeaveCount
    };
  },

  async attendanceTrend(from: Date, to: Date, officeId?: string) {
    const { start, end } = inclusiveRange(from, to);
    const rows = await prisma.timesheet.findMany({
      where: { workDate: { gte: start, lt: end }, ...(officeId ? { officeId } : {}) },
      select: { workDate: true, isLate: true, isMissingCheckout: true, actualCheckOut: true }
    });
    const leaves = await prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lt: end }, endDate: { gte: start }, ...(officeId ? { employee: { officeId } } : {}) },
      select: { startDate: true, endDate: true }
    });
    const byDate = new Map<string, { date: string; attendance: number; late: number; missingCheckout: number; approvedLeaveRequests: number }>();
    for (let d = DateTime.fromJSDate(start, { zone: "utc" }); d < DateTime.fromJSDate(end, { zone: "utc" }); d = d.plus({ days: 1 })) {
      const key = d.toISODate()!;
      byDate.set(key, { date: key, attendance: 0, late: 0, missingCheckout: 0, approvedLeaveRequests: 0 });
    }
    for (const row of rows) {
      const key = row.workDate.toISOString().slice(0, 10); const item = byDate.get(key); if (!item) continue;
      item.attendance++; if (row.isLate) item.late++; if (row.isMissingCheckout) item.missingCheckout++;
    }
    for (const leave of leaves) {
      const ls = DateTime.fromJSDate(leave.startDate, { zone: "utc" }); const le = DateTime.fromJSDate(leave.endDate, { zone: "utc" });
      for (let d = ls < DateTime.fromJSDate(start, { zone: "utc" }) ? DateTime.fromJSDate(start, { zone: "utc" }) : ls; d <= le && d < DateTime.fromJSDate(end, { zone: "utc" }); d = d.plus({ days: 1 })) {
        const item = byDate.get(d.toISODate()!); if (item) item.approvedLeaveRequests++;
      }
    }
    return [...byDate.values()];
  },

  async leaveSummary(from: Date, to: Date, officeId?: string) {
    const { start, end } = inclusiveRange(from, to);
    const grouped = await prisma.leaveRequest.groupBy({
      by: ["status"],
      where: { requestedAt: { gte: start, lt: end }, ...(officeId ? { employee: { officeId } } : {}) },
      _count: { _all: true },
      _sum: { numberOfDays: true }
    });
    return grouped.map((g) => ({ status: g.status, requests: g._count._all, days: Number(g._sum.numberOfDays ?? 0) }));
  },

  async recentActivity(limit = 20) {
    const items = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" }, take: Math.min(limit, 100),
      include: { actor: { select: { id: true, email: true } } }
    });
    return items;
  },

  async timesheetReport(input: any) {
    const { start, end } = inclusiveRange(input.from, input.to);
    const where = {
      workDate: { gte: start, lt: end },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.officeId ? { officeId: input.officeId } : {}),
      ...(input.status ? { status: input.status } : {})
    };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.timesheet.findMany({
        where, orderBy: [{ workDate: "desc" }, { actualCheckIn: "desc" }], skip, take: input.pageSize,
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } }, office: { select: { name: true } } }
      }),
      prisma.timesheet.count({ where })
    ]);
    return { items, meta: pagination(input.page, input.pageSize, total) };
  },

  async worksheetReport(input: any) {
    const { start, end } = inclusiveRange(input.from, input.to);
    const where = {
      workDate: { gte: start, lt: end },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.officeId ? { employee: { officeId: input.officeId } } : {}),
      ...(input.status ? { status: input.status } : {})
    };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.worksheet.findMany({
        where, orderBy: [{ workDate: "desc" }, { submittedAt: "desc" }], skip, take: input.pageSize,
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } }, timesheet: { select: { workedMinutes: true, status: true } } }
      }), prisma.worksheet.count({ where })
    ]);
    return { items, meta: pagination(input.page, input.pageSize, total) };
  },

  async leaveReport(input: any) {
    const { start, end } = inclusiveRange(input.from, input.to);
    const where = {
      requestedAt: { gte: start, lt: end },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      ...(input.officeId ? { employee: { officeId: input.officeId } } : {}),
      ...(input.status ? { status: input.status } : {})
    };
    const skip = (input.page - 1) * input.pageSize;
    const [items, total] = await prisma.$transaction([
      prisma.leaveRequest.findMany({
        where, orderBy: { requestedAt: "desc" }, skip, take: input.pageSize,
        include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } }, leaveType: true, decisions: { orderBy: { decidedAt: "desc" }, take: 1 } }
      }), prisma.leaveRequest.count({ where })
    ]);
    return { items, meta: pagination(input.page, input.pageSize, total) };
  },

  async employeeReport(employeeId: string, from: Date, to: Date) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { office: true, schedule: true, user: { select: { email: true } } } });
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
    const { start, end } = inclusiveRange(from, to);
    const [timesheets, worksheets, leaveRequests] = await prisma.$transaction([
      prisma.timesheet.findMany({ where: { employeeId, workDate: { gte: start, lt: end } }, orderBy: { workDate: "asc" } }),
      prisma.worksheet.findMany({ where: { employeeId, workDate: { gte: start, lt: end } }, orderBy: { workDate: "asc" } }),
      prisma.leaveRequest.findMany({ where: { employeeId, startDate: { lt: end }, endDate: { gte: start } }, include: { leaveType: true }, orderBy: { startDate: "asc" } })
    ]);
    const totals = timesheets.reduce((a, x) => ({
      workedMinutes: a.workedMinutes + x.workedMinutes,
      lateMinutes: a.lateMinutes + x.lateMinutes,
      overtimeMinutes: a.overtimeMinutes + x.overtimeMinutes,
      earlyCheckoutMinutes: a.earlyCheckoutMinutes + x.earlyCheckoutMinutes,
      lateDays: a.lateDays + (x.isLate ? 1 : 0),
      missingCheckoutDays: a.missingCheckoutDays + (x.isMissingCheckout ? 1 : 0)
    }), { workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, earlyCheckoutMinutes: 0, lateDays: 0, missingCheckoutDays: 0 });
    const approvedLeaveDays = leaveRequests.filter((x) => x.status === "APPROVED").reduce((n, x) => n + Number(x.numberOfDays), 0);
    return { employee, period: { from: start.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }, totals: { ...totals, attendanceDays: timesheets.length, worksheetsSubmitted: worksheets.length, approvedLeaveDays }, timesheets, worksheets, leaveRequests };
  }
};
