import type { RequestHandler } from "express";
import { attendanceCorrectnessService } from "./attendance-correctness.service.js";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const createCorrectnessRequests: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await attendanceCorrectnessService.createRequests(req.auth!.userId, req.body) });
  } catch (e) {
    next(e);
  }
};

export const myCorrectnessRequests: RequestHandler = async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(`${req.query.from as string}T00:00:00.000Z`) : undefined;
    const to = req.query.to ? new Date(`${req.query.to as string}T00:00:00.000Z`) : undefined;
    res.json({ data: await attendanceCorrectnessService.myRequests(req.auth!.userId, { from, to }) });
  } catch (e) {
    next(e);
  }
};

export const adminCorrectnessRequests: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await attendanceCorrectnessService.adminList(requireOrganizationId(req.auth), req.query as any, scope)
    });
  } catch (e) {
    next(e);
  }
};

export const approveCorrectnessRequest: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await attendanceCorrectnessService.approve(
        requireOrganizationId(req.auth),
        paramId(req.params.id!),
        auditContextFromRequest(req),
        scope,
        req.body.adminNote
      )
    });
  } catch (e) {
    next(e);
  }
};

export const rejectCorrectnessRequest: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await attendanceCorrectnessService.reject(
        requireOrganizationId(req.auth),
        paramId(req.params.id!),
        auditContextFromRequest(req),
        scope,
        req.body.adminNote
      )
    });
  } catch (e) {
    next(e);
  }
};
