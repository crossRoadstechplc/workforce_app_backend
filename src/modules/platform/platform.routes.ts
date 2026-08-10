import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission, requireSuperAdmin } from "../../middleware/authenticate.js";
import {
  changeOrgAdminStatus,
  changeOrganizationStatus,
  createOrgAdmin,
  createOrganization,
  getOrgAdmin,
  getOrganization,
  listOrgAdmins,
  listOrganizations,
  platformDashboard,
  resetOrgAdminPassword,
  updateOrganization
} from "./platform.controller.js";

export const platformRouter = Router();
platformRouter.use(authenticate, requireNormalSession, requireSuperAdmin);

platformRouter.get("/dashboard", requirePermission("platform.report.view"), platformDashboard);

platformRouter.post("/organizations", requirePermission("organization.manage"), createOrganization);
platformRouter.get("/organizations", requirePermission("organization.manage"), listOrganizations);
platformRouter.get("/organizations/:organizationId", requirePermission("organization.manage"), getOrganization);
platformRouter.patch("/organizations/:organizationId", requirePermission("organization.manage"), updateOrganization);
platformRouter.patch("/organizations/:organizationId/status", requirePermission("organization.manage"), changeOrganizationStatus);

platformRouter.post("/org-admins", requirePermission("org_admin.manage"), createOrgAdmin);
platformRouter.get("/org-admins", requirePermission("org_admin.manage"), listOrgAdmins);
platformRouter.get("/org-admins/:userId", requirePermission("org_admin.manage"), getOrgAdmin);
platformRouter.patch("/org-admins/:userId/status", requirePermission("org_admin.manage"), changeOrgAdminStatus);
platformRouter.post("/org-admins/:userId/reset-password", requirePermission("org_admin.manage"), resetOrgAdminPassword);
