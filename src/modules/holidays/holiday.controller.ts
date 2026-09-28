import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { holidayService } from "./holiday.service.js";

const param = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const catalogHolidays: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await holidayService.catalog(requireOrganizationId(req.auth), req.query as any, scope)
    });
  } catch (e) {
    next(e);
  }
};

export const holidayDetail: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await holidayService.detail(
        requireOrganizationId(req.auth),
        param(req.params.key!),
        req.query.year ? Number(req.query.year) : undefined,
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const applyHoliday: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.status(201).json({
      data: await holidayService.apply(
        requireOrganizationId(req.auth),
        req.body,
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const createCustomHoliday: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.status(201).json({
      data: await holidayService.createCustom(
        requireOrganizationId(req.auth),
        req.body,
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const setHolidayAutoApply: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await holidayService.setAutoApply(
        requireOrganizationId(req.auth),
        req.body,
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const holidayApplication: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await holidayService.application(
        requireOrganizationId(req.auth),
        param(req.params.id!),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const myHolidays: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await holidayService.myHolidays(req.auth!.userId, req.query as any) });
  } catch (e) {
    next(e);
  }
};
