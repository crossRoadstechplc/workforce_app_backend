import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission } from "../../middleware/authenticate.js";
import { changeScheduleStatus, createSchedule, getSchedule, listSchedules, updateSchedule } from "./schedule.controller.js";

export const scheduleAdminRouter = Router();
scheduleAdminRouter.use(authenticate, requireNormalSession, requirePermission("schedule.manage"));
scheduleAdminRouter.post("/", createSchedule);
scheduleAdminRouter.get("/", listSchedules);
scheduleAdminRouter.get("/:scheduleId", getSchedule);
scheduleAdminRouter.patch("/:scheduleId", updateSchedule);
scheduleAdminRouter.patch("/:scheduleId/status", changeScheduleStatus);
