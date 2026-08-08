import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { createScheduleSchema, scheduleListSchema, scheduleParamsSchema, scheduleStatusSchema, updateScheduleSchema } from "./schedule.schemas.js";
import { scheduleService } from "./schedule.service.js";

export const createSchedule: RequestHandler = async (req, res) => res.status(201).json(await scheduleService.create(createScheduleSchema.parse(req.body), auditContextFromRequest(req)));
export const listSchedules: RequestHandler = async (req, res) => res.json(await scheduleService.list(scheduleListSchema.parse(req.query)));
export const getSchedule: RequestHandler = async (req, res) => res.json(await scheduleService.get(scheduleParamsSchema.parse(req.params).scheduleId));
export const updateSchedule: RequestHandler = async (req, res) => {
  const { scheduleId } = scheduleParamsSchema.parse(req.params);
  res.json(await scheduleService.update(scheduleId, updateScheduleSchema.parse(req.body), auditContextFromRequest(req)));
};
export const changeScheduleStatus: RequestHandler = async (req, res) => {
  const { scheduleId } = scheduleParamsSchema.parse(req.params);
  res.json(await scheduleService.changeStatus(scheduleId, scheduleStatusSchema.parse(req.body), auditContextFromRequest(req)));
};
