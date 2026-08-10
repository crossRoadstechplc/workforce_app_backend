import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { createEmployeeSchema, employeeListSchema, employeeParamsSchema, employeeStatusSchema, resetPasswordSchema, updateEmployeeSchema } from "./employee.schemas.js";
import { employeeService } from "./employee.service.js";

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
