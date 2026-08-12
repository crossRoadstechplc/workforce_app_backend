import type { RequestHandler } from "express";
import { historyService } from "./history.service.js";
import { rosterService } from "./roster.service.js";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const myTimesheets: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await historyService.myTimesheets(req.auth!.userId, req.query) });
  } catch (e) {
    next(e);
  }
};
export const myTimesheet: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await historyService.myTimesheet(req.auth!.userId, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};
export const myTimesheetCalendar: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await historyService.myTimesheetCalendar(req.auth!.userId, Number(req.query.year), Number(req.query.month)) });
  } catch (e) {
    next(e);
  }
};
export const myWorksheets: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await historyService.myWorksheets(req.auth!.userId, req.query) });
  } catch (e) {
    next(e);
  }
};
export const myWorksheet: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await historyService.myWorksheet(req.auth!.userId, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};
export const myWorksheetCalendar: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await historyService.myWorksheetCalendar(req.auth!.userId, Number(req.query.year), Number(req.query.month)) });
  } catch (e) {
    next(e);
  }
};
export const adminTimesheets: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({ data: await historyService.adminTimesheets(requireOrganizationId(req.auth), req.query, scope) });
  } catch (e) {
    next(e);
  }
};
export const adminTimesheet: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({ data: await historyService.adminTimesheet(requireOrganizationId(req.auth), paramId(req.params.id!), scope) });
  } catch (e) {
    next(e);
  }
};
export const correctTimesheet: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await historyService.correctTimesheet(requireOrganizationId(req.auth), paramId(req.params.id!), req.body, auditContextFromRequest(req), scope)
    });
  } catch (e) {
    next(e);
  }
};
export const adminWorksheets: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({ data: await historyService.adminWorksheets(requireOrganizationId(req.auth), req.query, scope) });
  } catch (e) {
    next(e);
  }
};
export const adminWorksheet: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({ data: await historyService.adminWorksheet(requireOrganizationId(req.auth), paramId(req.params.id!), scope) });
  } catch (e) {
    next(e);
  }
};
export const reviewWorksheet: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await historyService.reviewWorksheet(requireOrganizationId(req.auth), paramId(req.params.id!), req.body, auditContextFromRequest(req), scope)
    });
  } catch (e) {
    next(e);
  }
};

export const attendanceDayRoster: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await rosterService.attendanceDayRoster(requireOrganizationId(req.auth), req.query as any, scope)
    });
  } catch (e) {
    next(e);
  }
};

export const attendanceMonthSummary: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await rosterService.attendanceMonthSummary(
        requireOrganizationId(req.auth),
        { year: Number(req.query.year), month: Number(req.query.month), officeId: req.query.officeId as string | undefined },
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const leaveDayRoster: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await rosterService.leaveDayRoster(requireOrganizationId(req.auth), req.query as any, scope)
    });
  } catch (e) {
    next(e);
  }
};

export const worksheetDayRoster: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await rosterService.worksheetDayRoster(requireOrganizationId(req.auth), req.query as any, scope)
    });
  } catch (e) {
    next(e);
  }
};
