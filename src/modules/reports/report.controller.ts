import type { RequestHandler } from "express";
import { reportService } from "./report.service.js";
import { toCsv } from "./csv.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";

function q(req: any) {
  return req.validated?.query ?? req.query;
}
function p(req: any) {
  return req.validated?.params ?? req.params;
}
function requireExport(req: any) {
  if (!req.auth?.permissions?.includes("report.export")) throw new AppError(403, "FORBIDDEN", "You do not have permission to export reports");
}
function sendCsv(res: any, filename: string, rows: Record<string, unknown>[], columns: { key: string; header: string }[]) {
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows, columns));
}

export const dashboardToday: RequestHandler = async (req, res, next) => {
  try {
    const input = q(req);
    const scope = getOfficeScope(req.auth);
    res.json({ data: await reportService.today(requireOrganizationId(req.auth), input.date ?? new Date(), scope, input.officeId) });
  } catch (e) {
    next(e);
  }
};
export const dashboardTrend: RequestHandler = async (req, res, next) => {
  try {
    const input = q(req);
    const scope = getOfficeScope(req.auth);
    res.json({ data: await reportService.attendanceTrend(requireOrganizationId(req.auth), input.from, input.to, scope, input.officeId) });
  } catch (e) {
    next(e);
  }
};
export const dashboardLeave: RequestHandler = async (req, res, next) => {
  try {
    const input = q(req);
    const scope = getOfficeScope(req.auth);
    res.json({ data: await reportService.leaveSummary(requireOrganizationId(req.auth), input.from, input.to, scope, input.officeId) });
  } catch (e) {
    next(e);
  }
};
export const dashboardActivity: RequestHandler = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    res.json({ data: await reportService.recentActivity(requireOrganizationId(req.auth), limit) });
  } catch (e) {
    next(e);
  }
};

export const timesheetReport: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = requireOrganizationId(req.auth);
    const input = q(req);
    const scope = getOfficeScope(req.auth);
    const result = await reportService.timesheetReport(organizationId, input, scope);
    if (input.format !== "csv") return res.json({ data: result });
    requireExport(req);
    await reportService.recordExport("TIMESHEET_REPORT", input, auditContextFromRequest(req));
    const rows = result.items.map((x: any) => ({
      date: x.workDate,
      employeeCode: x.employee.employeeCode,
      employee: `${x.employee.firstName} ${x.employee.lastName}`,
      department: x.employee.department ?? "",
      office: x.office.name,
      status: x.status,
      checkIn: x.actualCheckIn,
      checkOut: x.actualCheckOut ?? "",
      workedMinutes: x.workedMinutes,
      lateMinutes: x.lateMinutes,
      earlyCheckoutMinutes: x.earlyCheckoutMinutes,
      overtimeMinutes: x.overtimeMinutes
    }));
    sendCsv(res, "timesheets.csv", rows, [
      { key: "date", header: "Date" },
      { key: "employeeCode", header: "Employee Code" },
      { key: "employee", header: "Employee" },
      { key: "department", header: "Department" },
      { key: "office", header: "Office" },
      { key: "status", header: "Status" },
      { key: "checkIn", header: "Check In" },
      { key: "checkOut", header: "Check Out" },
      { key: "workedMinutes", header: "Worked Minutes" },
      { key: "lateMinutes", header: "Late Minutes" },
      { key: "earlyCheckoutMinutes", header: "Early Checkout Minutes" },
      { key: "overtimeMinutes", header: "Overtime Minutes" }
    ]);
  } catch (e) {
    next(e);
  }
};
export const worksheetReport: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = requireOrganizationId(req.auth);
    const input = q(req);
    const scope = getOfficeScope(req.auth);
    const result = await reportService.worksheetReport(organizationId, input, scope);
    if (input.format !== "csv") return res.json({ data: result });
    requireExport(req);
    await reportService.recordExport("WORKSHEET_REPORT", input, auditContextFromRequest(req));
    const rows = result.items.map((x: any) => ({
      date: x.workDate,
      employeeCode: x.employee.employeeCode,
      employee: `${x.employee.firstName} ${x.employee.lastName}`,
      department: x.employee.department ?? "",
      status: x.status,
      workedMinutes: x.timesheet.workedMinutes,
      description: x.workDescription,
      submittedAt: x.submittedAt
    }));
    sendCsv(res, "worksheets.csv", rows, [
      { key: "date", header: "Date" },
      { key: "employeeCode", header: "Employee Code" },
      { key: "employee", header: "Employee" },
      { key: "department", header: "Department" },
      { key: "status", header: "Status" },
      { key: "workedMinutes", header: "Worked Minutes" },
      { key: "description", header: "Work Description" },
      { key: "submittedAt", header: "Submitted At" }
    ]);
  } catch (e) {
    next(e);
  }
};
export const leaveReport: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = requireOrganizationId(req.auth);
    const input = q(req);
    const scope = getOfficeScope(req.auth);
    const result = await reportService.leaveReport(organizationId, input, scope);
    if (input.format !== "csv") return res.json({ data: result });
    requireExport(req);
    await reportService.recordExport("LEAVE_REPORT", input, auditContextFromRequest(req));
    const rows = result.items.map((x: any) => ({
      requestedAt: x.requestedAt,
      employeeCode: x.employee.employeeCode,
      employee: `${x.employee.firstName} ${x.employee.lastName}`,
      leaveType: x.leaveType.name,
      startDate: x.startDate,
      endDate: x.endDate,
      days: Number(x.numberOfDays),
      status: x.status,
      reason: x.reason,
      decisionReason: x.decisions[0]?.decisionReason ?? ""
    }));
    sendCsv(res, "leave.csv", rows, [
      { key: "requestedAt", header: "Requested At" },
      { key: "employeeCode", header: "Employee Code" },
      { key: "employee", header: "Employee" },
      { key: "leaveType", header: "Leave Type" },
      { key: "startDate", header: "Start Date" },
      { key: "endDate", header: "End Date" },
      { key: "days", header: "Days" },
      { key: "status", header: "Status" },
      { key: "reason", header: "Employee Reason" },
      { key: "decisionReason", header: "Decision Reason" }
    ]);
  } catch (e) {
    next(e);
  }
};
export const employeeReport: RequestHandler = async (req, res, next) => {
  try {
    const params = p(req),
      input = q(req);
    const scope = getOfficeScope(req.auth);
    res.json({ data: await reportService.employeeReport(requireOrganizationId(req.auth), params.employeeId, input.from, input.to, scope) });
  } catch (e) {
    next(e);
  }
};
