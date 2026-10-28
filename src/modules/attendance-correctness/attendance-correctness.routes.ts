import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  adminCorrectnessRequests,
  adminGetCorrectnessSubmission,
  approveCorrectnessRequest,
  approveCorrectnessSubmission,
  createCorrectnessRequests,
  myCorrectnessRequests,
  rejectCorrectnessRequest,
  rejectCorrectnessSubmission
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
adminAttendanceCorrectnessRouter.get(
  "/submissions/:submissionId",
  requirePermission("attendance.correctness.review"),
  adminGetCorrectnessSubmission
);
adminAttendanceCorrectnessRouter.post(
  "/submissions/:submissionId/approve",
  requirePermission("attendance.correctness.review"),
  validate(correctnessDecisionSchema),
  approveCorrectnessSubmission
);
adminAttendanceCorrectnessRouter.post(
  "/submissions/:submissionId/reject",
  requirePermission("attendance.correctness.review"),
  validate(correctnessDecisionSchema),
  rejectCorrectnessSubmission
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
