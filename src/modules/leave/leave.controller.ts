import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { leaveService } from "./leave.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const leaveTypes: RequestHandler = async (_req, res, next) => {
  try { res.json({ data: await leaveService.types() }); } catch (e) { next(e); }
};
export const createLeave: RequestHandler = async (req, res, next) => {
  try { res.status(201).json({ data: await leaveService.create(req.auth!.userId, req.body) }); } catch (e) { next(e); }
};
export const myLeaves: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.myList(req.auth!.userId, req.query) }); } catch (e) { next(e); }
};
export const myLeaveSummary: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.summary(req.auth!.userId) }); } catch (e) { next(e); }
};
export const myLeave: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.myGet(req.auth!.userId, paramId(req.params.id!)) }); } catch (e) { next(e); }
};
export const cancelLeave: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.cancel(req.auth!.userId, paramId(req.params.id!), req.body.reason) }); } catch (e) { next(e); }
};
export const adminLeaves: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.adminList(req.query) }); } catch (e) { next(e); }
};
export const adminLeave: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.adminGet(paramId(req.params.id!)) }); } catch (e) { next(e); }
};
export const approveLeave: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.decide(paramId(req.params.id!), "APPROVED", req.body.reason, auditContextFromRequest(req)) }); } catch (e) { next(e); }
};
export const rejectLeave: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await leaveService.decide(paramId(req.params.id!), "REJECTED", req.body.reason, auditContextFromRequest(req)) }); } catch (e) { next(e); }
};
