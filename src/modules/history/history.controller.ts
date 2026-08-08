import type { RequestHandler } from "express";
import { historyService } from "./history.service.js";
import { auditContextFromRequest } from "../../shared/audit.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const myTimesheets: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.myTimesheets(req.auth!.userId, req.query) }); } catch (e) { next(e); }
};
export const myTimesheet: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.myTimesheet(req.auth!.userId, paramId(req.params.id!)) }); } catch (e) { next(e); }
};
export const myTimesheetCalendar: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.myTimesheetCalendar(req.auth!.userId, Number(req.query.year), Number(req.query.month)) }); } catch (e) { next(e); }
};
export const myWorksheets: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.myWorksheets(req.auth!.userId, req.query) }); } catch (e) { next(e); }
};
export const myWorksheet: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.myWorksheet(req.auth!.userId, paramId(req.params.id!)) }); } catch (e) { next(e); }
};
export const myWorksheetCalendar: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.myWorksheetCalendar(req.auth!.userId, Number(req.query.year), Number(req.query.month)) }); } catch (e) { next(e); }
};
export const adminTimesheets: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.adminTimesheets(req.query) }); } catch (e) { next(e); }
};
export const adminTimesheet: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.adminTimesheet(paramId(req.params.id!)) }); } catch (e) { next(e); }
};
export const correctTimesheet: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.correctTimesheet(paramId(req.params.id!), req.body, auditContextFromRequest(req)) }); } catch (e) { next(e); }
};
export const adminWorksheets: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.adminWorksheets(req.query) }); } catch (e) { next(e); }
};
export const adminWorksheet: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.adminWorksheet(paramId(req.params.id!)) }); } catch (e) { next(e); }
};
export const reviewWorksheet: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await historyService.reviewWorksheet(paramId(req.params.id!), req.body, auditContextFromRequest(req)) }); } catch (e) { next(e); }
};
