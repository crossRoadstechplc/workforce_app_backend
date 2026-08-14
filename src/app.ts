import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { buildCorsOptions } from "./config/cors.js";
import { logger } from "./config/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { employeeAdminRouter } from "./modules/employees/employee.routes.js";
import { officeAdminRouter } from "./modules/offices/office.routes.js";
import { scheduleAdminRouter } from "./modules/schedules/schedule.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import {
  timesheetHistoryRouter,
  worksheetHistoryRouter,
  adminTimesheetRouter,
  adminWorksheetRouter,
  adminAttendanceRosterRouter,
  adminLeaveRosterRouter
} from "./modules/history/history.routes.js";
import { leaveRouter, adminLeaveRouter } from "./modules/leave/leave.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { adminDashboardRouter, adminReportRouter } from "./modules/reports/report.routes.js";
import { platformRouter } from "./modules/platform/platform.routes.js";
import { officeAdminsRouter } from "./modules/office-admins/office-admin.routes.js";
import { tenantContextRouter } from "./modules/context/tenant-context.routes.js";

export const app = express();
app.disable("x-powered-by");
app.use(requestId);
app.use(pinoHttp({ logger }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS"
}));
app.get("/api/v1/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/platform", platformRouter);
app.use("/api/v1/admin/office-admins", officeAdminsRouter);
app.use("/api/v1/admin/context", tenantContextRouter);
app.use("/api/v1/admin/employees", employeeAdminRouter);
app.use("/api/v1/admin/offices", officeAdminRouter);
app.use("/api/v1/admin/schedules", scheduleAdminRouter);
app.use("/api/v1/attendance", attendanceRouter);
app.use("/api/v1/timesheets", timesheetHistoryRouter);
app.use("/api/v1/worksheets", worksheetHistoryRouter);
app.use("/api/v1/leave-requests", leaveRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/admin/timesheets", adminTimesheetRouter);
app.use("/api/v1/admin/attendance", adminAttendanceRosterRouter);
app.use("/api/v1/admin/worksheets", adminWorksheetRouter);
app.use("/api/v1/admin/leave", adminLeaveRosterRouter);
app.use("/api/v1/admin/leave-requests", adminLeaveRouter);
app.use("/api/v1/admin/dashboard", adminDashboardRouter);
app.use("/api/v1/admin/reports", adminReportRouter);
app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
app.use(errorHandler);
