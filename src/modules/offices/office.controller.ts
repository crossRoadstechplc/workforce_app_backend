import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { createOfficeSchema, officeListSchema, officeParamsSchema, officeStatusSchema, updateOfficeSchema } from "./office.schemas.js";
import { officeService } from "./office.service.js";

export const createOffice: RequestHandler = async (req, res) => res.status(201).json(await officeService.create(createOfficeSchema.parse(req.body), auditContextFromRequest(req)));
export const listOffices: RequestHandler = async (req, res) => res.json(await officeService.list(officeListSchema.parse(req.query)));
export const getOffice: RequestHandler = async (req, res) => res.json(await officeService.get(officeParamsSchema.parse(req.params).officeId));
export const updateOffice: RequestHandler = async (req, res) => {
  const { officeId } = officeParamsSchema.parse(req.params);
  res.json(await officeService.update(officeId, updateOfficeSchema.parse(req.body), auditContextFromRequest(req)));
};
export const changeOfficeStatus: RequestHandler = async (req, res) => {
  const { officeId } = officeParamsSchema.parse(req.params);
  res.json(await officeService.changeStatus(officeId, officeStatusSchema.parse(req.body), auditContextFromRequest(req)));
};
