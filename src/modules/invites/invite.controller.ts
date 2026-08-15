import type { RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { inviteService } from "./invite.service.js";
import {
  acceptAdminSchema,
  acceptEmployeeSchema,
  createEmployeeInviteSchema,
  inviteIdParamsSchema,
  inviteListSchema,
  inviteTokenParamsSchema
} from "./invite.schemas.js";

export const getInvite: RequestHandler = async (req, res) => {
  const { token } = inviteTokenParamsSchema.parse(req.params);
  res.json(await inviteService.getPublic(token));
};

export const acceptAdminInvite: RequestHandler = async (req, res) => {
  const { token } = inviteTokenParamsSchema.parse(req.params);
  const body = acceptAdminSchema.parse(req.body);
  res.json(await inviteService.acceptAdmin(token, body.password));
};

export const acceptEmployeeInvite: RequestHandler = async (req, res) => {
  const { token } = inviteTokenParamsSchema.parse(req.params);
  const body = acceptEmployeeSchema.parse(req.body);
  res.status(201).json(await inviteService.acceptEmployee(token, body));
};

export const createEmployeeInvite: RequestHandler = async (req, res) => {
  const organizationId = requireOrganizationId(req.auth);
  const body = createEmployeeInviteSchema.parse(req.body);
  res.status(201).json(await inviteService.createEmployeeInvite(organizationId, body, auditContextFromRequest(req), getOfficeScope(req.auth)));
};

export const listInvites: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  res.json(await inviteService.list(req.auth, inviteListSchema.parse(req.query)));
};

export const resendInvite: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const { id } = inviteIdParamsSchema.parse(req.params);
  res.json(await inviteService.resend(req.auth, id));
};
