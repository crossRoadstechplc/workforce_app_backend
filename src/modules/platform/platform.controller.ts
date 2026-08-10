import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { platformService } from "./platform.service.js";
import {
  orgAdminCreateSchema,
  orgAdminListSchema,
  orgAdminParamsSchema,
  orgAdminResetPasswordSchema,
  orgAdminStatusSchema,
  organizationCreateSchema,
  organizationListSchema,
  organizationParamsSchema,
  organizationStatusSchema,
  organizationUpdateSchema
} from "./platform.schemas.js";

export const platformDashboard: RequestHandler = async (_req, res) => res.json({ data: await platformService.dashboard() });

export const createOrganization: RequestHandler = async (req, res) => {
  res.status(201).json(await platformService.createOrganization(organizationCreateSchema.parse(req.body), auditContextFromRequest(req)));
};
export const listOrganizations: RequestHandler = async (req, res) =>
  res.json(await platformService.listOrganizations(organizationListSchema.parse(req.query)));
export const getOrganization: RequestHandler = async (req, res) =>
  res.json(await platformService.getOrganization(organizationParamsSchema.parse(req.params).organizationId));
export const updateOrganization: RequestHandler = async (req, res) => {
  const { organizationId } = organizationParamsSchema.parse(req.params);
  res.json(await platformService.updateOrganization(organizationId, organizationUpdateSchema.parse(req.body), auditContextFromRequest(req)));
};
export const changeOrganizationStatus: RequestHandler = async (req, res) => {
  const { organizationId } = organizationParamsSchema.parse(req.params);
  res.json(await platformService.changeOrganizationStatus(organizationId, organizationStatusSchema.parse(req.body), auditContextFromRequest(req)));
};

export const createOrgAdmin: RequestHandler = async (req, res) => {
  const result = await platformService.createOrgAdmin(orgAdminCreateSchema.parse(req.body), auditContextFromRequest(req));
  res.status(201).json(result);
};
export const listOrgAdmins: RequestHandler = async (req, res) =>
  res.json(await platformService.listOrgAdmins(orgAdminListSchema.parse(req.query)));
export const getOrgAdmin: RequestHandler = async (req, res) =>
  res.json(await platformService.getOrgAdmin(orgAdminParamsSchema.parse(req.params).userId));
export const changeOrgAdminStatus: RequestHandler = async (req, res) => {
  const { userId } = orgAdminParamsSchema.parse(req.params);
  res.json(await platformService.changeOrgAdminStatus(userId, orgAdminStatusSchema.parse(req.body), auditContextFromRequest(req)));
};
export const resetOrgAdminPassword: RequestHandler = async (req, res) => {
  const { userId } = orgAdminParamsSchema.parse(req.params);
  res.json(await platformService.resetOrgAdminPassword(userId, orgAdminResetPasswordSchema.parse(req.body), auditContextFromRequest(req)));
};
