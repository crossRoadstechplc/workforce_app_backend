import { Router } from "express";
import { authenticate, requireAnyPermission, requireNormalSession, requireOrgContext } from "../../middleware/authenticate.js";
import {
  acceptCompanyAsset,
  adminCompanyAssets,
  createCompanyAsset,
  declineCompanyAsset,
  deleteCompanyAsset,
  myCompanyAssets,
  returnCompanyAsset,
  updateCompanyAsset
} from "./company-asset.controller.js";

export const companyAssetRouter = Router();
companyAssetRouter.use(authenticate, requireNormalSession);
companyAssetRouter.get("/me", requireAnyPermission("company_asset.view_own", "notification.view"), myCompanyAssets);
companyAssetRouter.post("/me/:id/accept", requireAnyPermission("company_asset.respond", "notification.view"), acceptCompanyAsset);
companyAssetRouter.post("/me/:id/decline", requireAnyPermission("company_asset.respond", "notification.view"), declineCompanyAsset);

export const adminCompanyAssetRouter = Router();
adminCompanyAssetRouter.use(authenticate, requireNormalSession, requireOrgContext);
adminCompanyAssetRouter.get("/", requireAnyPermission("company_asset.manage", "employee.view"), adminCompanyAssets);
adminCompanyAssetRouter.post("/", requireAnyPermission("company_asset.manage", "employee.update"), createCompanyAsset);
adminCompanyAssetRouter.patch("/:id", requireAnyPermission("company_asset.manage", "employee.update"), updateCompanyAsset);
adminCompanyAssetRouter.post("/:id/return", requireAnyPermission("company_asset.manage", "employee.update"), returnCompanyAsset);
adminCompanyAssetRouter.delete("/:id", requireAnyPermission("company_asset.manage", "employee.update"), deleteCompanyAsset);
