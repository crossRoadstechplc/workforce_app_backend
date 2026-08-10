import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { changeOfficeStatus, createOffice, getOffice, listOffices, updateOffice } from "./office.controller.js";

export const officeAdminRouter = Router();
officeAdminRouter.use(authenticate, requireNormalSession, requireOrgContext);
officeAdminRouter.get("/", requirePermission("office.manage"), listOffices);
officeAdminRouter.get("/:officeId", requirePermission("office.manage"), getOffice);
officeAdminRouter.post("/", requireOrgAdmin, requirePermission("office.manage"), createOffice);
officeAdminRouter.patch("/:officeId", requireOrgAdmin, requirePermission("office.manage"), updateOffice);
officeAdminRouter.patch("/:officeId/status", requireOrgAdmin, requirePermission("office.manage"), changeOfficeStatus);
