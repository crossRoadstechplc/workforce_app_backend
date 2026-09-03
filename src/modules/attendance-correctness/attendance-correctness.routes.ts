import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  adminCorrectnessRequests,
  approveCorrectnessRequest,
  createCorrectnessRequests,
  myCorrectnessRequests,
  rejectCorrectnessRequest
} from "./attendance-correctness.controller.js";
import {
  adminCorrectnessListSchema,
  correctnessDecisionSchema,
  createCorrectnessRequestsSchema,
  myCorrectnessRequestsSchema
} from "./attendance-correctness.schemas.js";

export const attendanceCorrectnessRouter = Router();
attendanceCorrectnessRouter.use(authenticate, requireNormalSession);
attendanceCorrectnessRouter.post(
  "/",
  requirePermission("attendance.correctness.request"),
  validate(createCorrectnessRequestsSchema),
  createCorrectnessRequests
);
attendanceCorrectnessRouter.get(
  "/",
  requirePermission("attendance.view_own"),
  validate(myCorrectnessRequestsSchema),
  myCorrectnessRequests
);

export const adminAttendanceCorrectnessRouter = Router();
adminAttendanceCorrectnessRouter.use(authenticate, requireNormalSession, requireOrgContext);
adminAttendanceCorrectnessRouter.get(
  "/",
  requirePermission("attendance.correctness.review"),
  validate(adminCorrectnessListSchema),
  adminCorrectnessRequests
);
adminAttendanceCorrectnessRouter.post(
  "/:id/approve",
  requirePermission("attendance.correctness.review"),
  validate(correctnessDecisionSchema),
  approveCorrectnessRequest
);
adminAttendanceCorrectnessRouter.post(
  "/:id/reject",
  requirePermission("attendance.correctness.review"),
  validate(correctnessDecisionSchema),
  rejectCorrectnessRequest
);
