import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext } from "../../middleware/authenticate.js";
import { getTenantContext } from "./tenant-context.controller.js";

export const tenantContextRouter = Router();
tenantContextRouter.use(authenticate, requireNormalSession, requireOrgContext);
tenantContextRouter.get("/", getTenantContext);
