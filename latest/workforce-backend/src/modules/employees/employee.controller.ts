import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { createEmployeeSchema, employeeListSchema, employeeParamsSchema, employeeStatusSchema, resetPasswordSchema, updateEmployeeSchema } from "./employee.schemas.js";
import { employeeService } from "./employee.service.js";

export const createEmployee: RequestHandler = async (req, res) => {
  const result = await employeeService.create(createEmployeeSchema.parse(req.body), auditContextFromRequest(req));
  res.status(201).json(result);
};
export const listEmployees: RequestHandler = async (req, res) => res.json(await employeeService.list(employeeListSchema.parse(req.query)));
export const getEmployee: RequestHandler = async (req, res) => res.json(await employeeService.get(employeeParamsSchema.parse(req.params).employeeId));
export const updateEmployee: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.json(await employeeService.update(employeeId, updateEmployeeSchema.parse(req.body), auditContextFromRequest(req)));
};
export const changeEmployeeStatus: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.json(await employeeService.changeStatus(employeeId, employeeStatusSchema.parse(req.body), auditContextFromRequest(req)));
};
export const resetEmployeePassword: RequestHandler = async (req, res) => {
  const { employeeId } = employeeParamsSchema.parse(req.params);
  res.json(await employeeService.resetPassword(employeeId, resetPasswordSchema.parse(req.body), auditContextFromRequest(req)));
};
