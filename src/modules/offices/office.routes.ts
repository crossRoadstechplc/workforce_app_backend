import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission } from "../../middleware/authenticate.js";
import { changeOfficeStatus, createOffice, getOffice, listOffices, updateOffice } from "./office.controller.js";

export const officeAdminRouter = Router();
officeAdminRouter.use(authenticate, requireNormalSession, requirePermission("office.manage"));
officeAdminRouter.post("/", createOffice);
officeAdminRouter.get("/", listOffices);
officeAdminRouter.get("/:officeId", getOffice);
officeAdminRouter.patch("/:officeId", updateOffice);
officeAdminRouter.patch("/:officeId/status", changeOfficeStatus);
