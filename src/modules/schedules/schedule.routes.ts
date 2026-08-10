import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { changeScheduleStatus, createSchedule, getSchedule, listSchedules, updateSchedule } from "./schedule.controller.js";

export const scheduleAdminRouter = Router();
scheduleAdminRouter.use(authenticate, requireNormalSession, requireOrgContext, requireOrgAdmin);
scheduleAdminRouter.post("/", requirePermission("schedule.manage"), createSchedule);
scheduleAdminRouter.get("/", requirePermission("schedule.manage"), listSchedules);
scheduleAdminRouter.get("/:scheduleId", requirePermission("schedule.manage"), getSchedule);
scheduleAdminRouter.patch("/:scheduleId", requirePermission("schedule.manage"), updateSchedule);
scheduleAdminRouter.patch("/:scheduleId/status", requirePermission("schedule.manage"), changeScheduleStatus);
