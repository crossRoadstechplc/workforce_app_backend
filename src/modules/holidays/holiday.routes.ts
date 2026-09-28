import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  applyHoliday,
  catalogHolidays,
  createCustomHoliday,
  holidayApplication,
  holidayDetail,
  myHolidays,
  setHolidayAutoApply
} from "./holiday.controller.js";
import {
  applyHolidaySchema,
  createCustomHolidaySchema,
  holidayApplicationIdSchema,
  holidayCatalogSchema,
  holidayDetailSchema,
  myHolidaysSchema,
  setHolidayAutoApplySchema
} from "./holiday.schemas.js";

export const holidayRouter = Router();
holidayRouter.use(authenticate, requireNormalSession);
holidayRouter.get("/me", requirePermission("attendance.view_own"), validate(myHolidaysSchema), myHolidays);

export const adminHolidayRouter = Router();
adminHolidayRouter.use(authenticate, requireNormalSession, requireOrgContext);
adminHolidayRouter.get("/", requirePermission("attendance.view_all"), validate(holidayCatalogSchema), catalogHolidays);
adminHolidayRouter.post("/apply", requirePermission("attendance.correct"), validate(applyHolidaySchema), applyHoliday);
adminHolidayRouter.post("/custom", requirePermission("attendance.correct"), validate(createCustomHolidaySchema), createCustomHoliday);
adminHolidayRouter.post(
  "/auto-apply",
  requirePermission("attendance.correct"),
  validate(setHolidayAutoApplySchema),
  setHolidayAutoApply
);
adminHolidayRouter.get(
  "/applications/:id",
  requirePermission("attendance.view_all"),
  validate(holidayApplicationIdSchema),
  holidayApplication
);
adminHolidayRouter.get("/:key", requirePermission("attendance.view_all"), validate(holidayDetailSchema), holidayDetail);
