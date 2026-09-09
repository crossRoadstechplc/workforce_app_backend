import { Router } from "express";
import {
  authenticate,
  requireNormalSession,
  requireOrgAdmin,
  requireOrgContext,
  requireTenantAdmin
} from "../../middleware/authenticate.js";
import { adminEnable, adminStatus, adminSummary } from "./controller.js";

export const adminTaskTrackerRouter = Router();

adminTaskTrackerRouter.use(authenticate, requireNormalSession, requireOrgContext);

/** Company + office admins can view overview (role-based; no new JWT permission required). */
adminTaskTrackerRouter.get("/status", requireTenantAdmin, adminStatus);
adminTaskTrackerRouter.get("/summary", requireTenantAdmin, adminSummary);

/** Only company admins enable the module. */
adminTaskTrackerRouter.post("/enable", requireOrgAdmin, adminEnable);
