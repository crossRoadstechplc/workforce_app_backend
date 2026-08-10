import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import {
  createOfficeAdminSchema,
  officeAdminListSchema,
  officeAdminParamsSchema,
  officeAdminStatusSchema,
  resetOfficeAdminPasswordSchema,
  updateOfficeAdminOfficesSchema
} from "./office-admin.schemas.js";
import { officeAdminService } from "./office-admin.service.js";

export const createOfficeAdmin: RequestHandler = async (req, res) => {
  const organizationId = requireOrganizationId(req.auth);
  const body = createOfficeAdminSchema.parse(req.body);
  const result = await officeAdminService.create(organizationId, body, auditContextFromRequest(req));
  res.status(201).json(result);
};

export const listOfficeAdmins: RequestHandler = async (req, res) =>
  res.json(await officeAdminService.list(requireOrganizationId(req.auth), officeAdminListSchema.parse(req.query)));

export const getOfficeAdmin: RequestHandler = async (req, res) => {
  const { userId } = officeAdminParamsSchema.parse(req.params);
  res.json(await officeAdminService.get(requireOrganizationId(req.auth), userId));
};

export const updateOfficeAdminOffices: RequestHandler = async (req, res) => {
  const { userId } = officeAdminParamsSchema.parse(req.params);
  const body = updateOfficeAdminOfficesSchema.parse(req.body);
  res.json(await officeAdminService.updateOffices(requireOrganizationId(req.auth), userId, body.officeIds, auditContextFromRequest(req)));
};

export const changeOfficeAdminStatus: RequestHandler = async (req, res) => {
  const { userId } = officeAdminParamsSchema.parse(req.params);
  const body = officeAdminStatusSchema.parse(req.body);
  res.json(await officeAdminService.changeStatus(requireOrganizationId(req.auth), userId, body, auditContextFromRequest(req)));
};

export const resetOfficeAdminPassword: RequestHandler = async (req, res) => {
  const { userId } = officeAdminParamsSchema.parse(req.params);
  const body = resetOfficeAdminPasswordSchema.parse(req.body);
  res.json(await officeAdminService.resetPassword(requireOrganizationId(req.auth), userId, body, auditContextFromRequest(req)));
};
