import type { RequestHandler } from "express";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { tenantContextService } from "./tenant-context.service.js";

export const getTenantContext: RequestHandler = async (req, res) => {
  const organizationId = requireOrganizationId(req.auth);
  const scope = getOfficeScope(req.auth);
  res.json(await tenantContextService.get(organizationId, scope));
};
