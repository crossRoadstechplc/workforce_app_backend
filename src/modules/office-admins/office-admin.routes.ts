import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext } from "../../middleware/authenticate.js";
import {
  changeOfficeAdminStatus,
  createOfficeAdmin,
  getOfficeAdmin,
  listOfficeAdmins,
  resetOfficeAdminPassword,
  updateOfficeAdminOffices
} from "./office-admin.controller.js";

export const officeAdminsRouter = Router();
officeAdminsRouter.use(authenticate, requireNormalSession, requireOrgContext, requireOrgAdmin);
officeAdminsRouter.post("/", createOfficeAdmin);
officeAdminsRouter.get("/", listOfficeAdmins);
officeAdminsRouter.get("/:userId", getOfficeAdmin);
officeAdminsRouter.patch("/:userId/offices", updateOfficeAdminOffices);
officeAdminsRouter.patch("/:userId/status", changeOfficeAdminStatus);
officeAdminsRouter.post("/:userId/reset-password", resetOfficeAdminPassword);
