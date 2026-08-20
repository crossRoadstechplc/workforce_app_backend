import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { displayService } from "./display.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const adminListDisplays: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await displayService.list(requireOrganizationId(req.auth)) });
  } catch (e) {
    next(e);
  }
};

export const adminCreateDisplay: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await displayService.create(requireOrganizationId(req.auth), req.body, auditContextFromRequest(req)) });
  } catch (e) {
    next(e);
  }
};

export const adminRePairDisplay: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await displayService.rePair(requireOrganizationId(req.auth), paramId(req.params.id!), auditContextFromRequest(req)) });
  } catch (e) {
    next(e);
  }
};

export const adminRevokeDisplay: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await displayService.revoke(requireOrganizationId(req.auth), paramId(req.params.id!), auditContextFromRequest(req)) });
  } catch (e) {
    next(e);
  }
};

export const pairDisplay: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await displayService.pair((req.body as { code: string }).code) });
  } catch (e) {
    next(e);
  }
};

export const refreshDisplay: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await displayService.refresh((req.body as { refreshToken: string }).refreshToken) });
  } catch (e) {
    next(e);
  }
};

export const displayRooms: RequestHandler = async (req, res, next) => {
  try {
    const display = req.display!;
    res.json({ data: await displayService.roomsBoard(display.organizationId, display.officeId, (req.query as { date?: string }).date) });
  } catch (e) {
    next(e);
  }
};

export const displayPeople: RequestHandler = async (req, res, next) => {
  try {
    const display = req.display!;
    res.json({ data: await displayService.peopleBoard(display.organizationId, display.officeId) });
  } catch (e) {
    next(e);
  }
};
