import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import {
  adminEmergencyContactParamsSchema,
  createEmployeeSchema,
  emergencyContactBodySchema,
  emergencyContactParamsSchema,
  emergencyContactUpdateSchema,
  employeeListSchema,
  employeeParamsSchema,
  employeeStatusSchema,
  resetPasswordSchema,
  updateEmployeeSchema
} from "./employee.schemas.js";
import { employeeService } from "./employee.service.js";
import { emergencyContactService } from "./emergency-contact.service.js";
import { AppError } from "../../shared/errors/app-error.js";

export const createEmployee: RequestHandler = async (req, res) => {
  const organizationId = requireOrganizationId(req.auth);
  const scope = getOfficeScope(req.auth);
  const result = await employeeService.create(organizationId, createEmployeeSchema.parse(req.body), auditContextFromRequest(req), scope);
  res.status(201).json(result);
};
export const listEmployees: RequestHandler = async (req, res) =>
  res.json(await employeeService.list(requireOrganizationId(req.auth), employeeListSchema.parse(req.query), getOfficeScope(req.auth)));
export const getEmployee: RequestHandler = async (req, res) =>
  res.json(await employeeService.get(requireOrganizationId(req.auth), employeeParamsSchema.parse(req.params).employeeId, getOfficeScope(req.auth)));
export const updateEmployee: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.json(await employeeService.update(requireOrganizationId(req.auth), employeeId, updateEmployeeSchema.parse(req.body), auditContextFromRequest(req), getOfficeScope(req.auth)));
};
export const changeEmployeeStatus: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.json(await employeeService.changeStatus(requireOrganizationId(req.auth), employeeId, employeeStatusSchema.parse(req.body), auditContextFromRequest(req), getOfficeScope(req.auth)));
};
export const resetEmployeePassword: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.json(await employeeService.resetPassword(requireOrganizationId(req.auth), employeeId, resetPasswordSchema.parse(req.body), auditContextFromRequest(req), getOfficeScope(req.auth)));
};

export const listMyEmergencyContacts: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  res.json({ items: await emergencyContactService.listMine(req.auth.userId) });
};

export const createMyEmergencyContact: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  res.status(201).json(await emergencyContactService.createMine(req.auth.userId, emergencyContactBodySchema.parse(req.body), auditContextFromRequest(req)));
};

export const updateMyEmergencyContact: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const { contactId } = emergencyContactParamsSchema.parse(req.params);
  res.json(await emergencyContactService.updateMine(req.auth.userId, contactId, emergencyContactUpdateSchema.parse(req.body), auditContextFromRequest(req)));
};

export const deleteMyEmergencyContact: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const { contactId } = emergencyContactParamsSchema.parse(req.params);
  res.json(await emergencyContactService.deleteMine(req.auth.userId, contactId, auditContextFromRequest(req)));
};

export const createAdminEmergencyContact: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.status(201).json(
    await emergencyContactService.createAdmin(
      requireOrganizationId(req.auth),
      employeeId,
      emergencyContactBodySchema.parse(req.body),
      auditContextFromRequest(req),
      getOfficeScope(req.auth)
    )
  );
};

export const updateAdminEmergencyContact: RequestHandler = async (req, res) => {
  const { employeeId, contactId } = adminEmergencyContactParamsSchema.parse(req.params);
  res.json(
    await emergencyContactService.updateAdmin(
      requireOrganizationId(req.auth),
      employeeId,
      contactId,
      emergencyContactUpdateSchema.parse(req.body),
      auditContextFromRequest(req),
      getOfficeScope(req.auth)
    )
  );
};

export const deleteAdminEmergencyContact: RequestHandler = async (req, res) => {
  const { employeeId, contactId } = adminEmergencyContactParamsSchema.parse(req.params);
  res.json(
    await emergencyContactService.deleteAdmin(
      requireOrganizationId(req.auth),
      employeeId,
      contactId,
      auditContextFromRequest(req),
      getOfficeScope(req.auth)
    )
  );
};
