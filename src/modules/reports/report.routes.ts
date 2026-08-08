import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import { dashboardRangeSchema, employeeReportSchema, reportListSchema, trendSchema } from "./report.schemas.js";
import { dashboardActivity, dashboardLeave, dashboardToday, dashboardTrend, employeeReport, leaveReport, timesheetReport, worksheetReport } from "./report.controller.js";

export const adminDashboardRouter = Router();
adminDashboardRouter.use(authenticate, requireNormalSession, requirePermission("report.view"));
adminDashboardRouter.get("/today", validate(dashboardRangeSchema), dashboardToday);
adminDashboardRouter.get("/attendance-trend", validate(trendSchema), dashboardTrend);
adminDashboardRouter.get("/leave-summary", validate(trendSchema), dashboardLeave);
adminDashboardRouter.get("/recent-activity", dashboardActivity);

export const adminReportRouter = Router();
adminReportRouter.use(authenticate, requireNormalSession, requirePermission("report.view"));
adminReportRouter.get("/timesheets", validate(reportListSchema), timesheetReport);
adminReportRouter.get("/worksheets", validate(reportListSchema), worksheetReport);
adminReportRouter.get("/leave", validate(reportListSchema), leaveReport);
adminReportRouter.get("/employees/:employeeId", validate(employeeReportSchema), employeeReport);
