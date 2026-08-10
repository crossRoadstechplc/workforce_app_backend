import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  adminTimesheet,
  adminTimesheets,
  adminWorksheet,
  adminWorksheets,
  correctTimesheet,
  myTimesheet,
  myTimesheetCalendar,
  myTimesheets,
  myWorksheet,
  myWorksheetCalendar,
  myWorksheets,
  reviewWorksheet
} from "./history.controller.js";
import {
  adminTimesheetListSchema,
  calendarSchema,
  correctionSchema,
  employeeHistorySchema,
  idSchema,
  worksheetReviewSchema
} from "./history.schemas.js";

export const timesheetHistoryRouter = Router();
timesheetHistoryRouter.use(authenticate, requireNormalSession);
timesheetHistoryRouter.get("/", requirePermission("attendance.view_own"), validate(employeeHistorySchema), myTimesheets);
timesheetHistoryRouter.get("/calendar", requirePermission("attendance.view_own"), validate(calendarSchema), myTimesheetCalendar);
timesheetHistoryRouter.get("/:id", requirePermission("attendance.view_own"), validate(idSchema), myTimesheet);

export const worksheetHistoryRouter = Router();
worksheetHistoryRouter.use(authenticate, requireNormalSession);
worksheetHistoryRouter.get("/", requirePermission("worksheet.view_own"), validate(employeeHistorySchema), myWorksheets);
worksheetHistoryRouter.get("/calendar", requirePermission("worksheet.view_own"), validate(calendarSchema), myWorksheetCalendar);
worksheetHistoryRouter.get("/:id", requirePermission("worksheet.view_own"), validate(idSchema), myWorksheet);

export const adminTimesheetRouter = Router();
adminTimesheetRouter.use(authenticate, requireNormalSession, requireOrgContext);
adminTimesheetRouter.get("/", requirePermission("attendance.view_all"), validate(adminTimesheetListSchema), adminTimesheets);
adminTimesheetRouter.get("/:id", requirePermission("attendance.view_all"), validate(idSchema), adminTimesheet);
adminTimesheetRouter.post("/:id/correct", requirePermission("attendance.correct"), validate(correctionSchema), correctTimesheet);

export const adminWorksheetRouter = Router();
adminWorksheetRouter.use(authenticate, requireNormalSession, requireOrgContext);
adminWorksheetRouter.get("/", requirePermission("worksheet.view_all"), validate(adminTimesheetListSchema), adminWorksheets);
adminWorksheetRouter.get("/:id", requirePermission("worksheet.view_all"), validate(idSchema), adminWorksheet);
adminWorksheetRouter.post("/:id/review", requirePermission("worksheet.review"), validate(worksheetReviewSchema), reviewWorksheet);
