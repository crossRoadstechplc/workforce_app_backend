import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import {
  createDepartmentSchema,
  departmentListSchema,
  departmentParamsSchema,
  departmentStatusSchema,
  updateDepartmentSchema
} from "./department.schemas.js";
import { departmentService } from "./department.service.js";

export const createDepartment: RequestHandler = async (req, res) =>
  res.status(201).json(await departmentService.create(requireOrganizationId(req.auth), createDepartmentSchema.parse(req.body), auditContextFromRequest(req)));

export const listDepartments: RequestHandler = async (req, res) =>
  res.json(await departmentService.list(requireOrganizationId(req.auth), departmentListSchema.parse(req.query)));

export const getDepartment: RequestHandler = async (req, res) =>
  res.json(await departmentService.get(requireOrganizationId(req.auth), departmentParamsSchema.parse(req.params).departmentId));

export const updateDepartment: RequestHandler = async (req, res) => {
  const { departmentId } = departmentParamsSchema.parse(req.params);
  res.json(await departmentService.update(requireOrganizationId(req.auth), departmentId, updateDepartmentSchema.parse(req.body), auditContextFromRequest(req)));
};

export const changeDepartmentStatus: RequestHandler = async (req, res) => {
  const { departmentId } = departmentParamsSchema.parse(req.params);
  res.json(await departmentService.changeStatus(requireOrganizationId(req.auth), departmentId, departmentStatusSchema.parse(req.body), auditContextFromRequest(req)));
};
