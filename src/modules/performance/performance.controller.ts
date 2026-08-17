import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { toCsv } from "../reports/csv.js";
import { performanceService } from "./performance.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const myEvaluations: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.myList(req.auth!.userId, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const myEvaluation: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.myGet(req.auth!.userId, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const saveMyEvaluation: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.employeeDraft(req.auth!.userId, paramId(req.params.id!), req.body) });
  } catch (e) {
    next(e);
  }
};

export const submitMyEvaluation: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.employeeSubmit(req.auth!.userId, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const adminEvaluations: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await performanceService.adminList(requireOrganizationId(req.auth), req.auth!.userId, req.query as never, scope)
    });
  } catch (e) {
    next(e);
  }
};

export const adminEvaluation: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({ data: await performanceService.adminGet(requireOrganizationId(req.auth), paramId(req.params.id!), scope) });
  } catch (e) {
    next(e);
  }
};

export const saveAdminEvaluation: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await performanceService.evaluatorDraft(
        requireOrganizationId(req.auth),
        req.auth!.userId,
        paramId(req.params.id!),
        req.body,
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const submitAdminEvaluation: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await performanceService.evaluatorSubmit(
        requireOrganizationId(req.auth),
        req.auth!.userId,
        paramId(req.params.id!),
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const finalizeEvaluation: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await performanceService.finalize(
        requireOrganizationId(req.auth),
        req.auth!.userId,
        paramId(req.params.id!),
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const adminCycles: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.listCycles(requireOrganizationId(req.auth), req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const adminCycle: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.getCycle(requireOrganizationId(req.auth), paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const createCycle: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.status(201).json({
      data: await performanceService.createCycle(
        requireOrganizationId(req.auth),
        req.auth!.userId,
        req.body,
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const openCycle: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    res.json({
      data: await performanceService.openCycle(
        requireOrganizationId(req.auth),
        paramId(req.params.id!),
        req.body ?? {},
        auditContextFromRequest(req),
        scope
      )
    });
  } catch (e) {
    next(e);
  }
};

export const closeCycle: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await performanceService.closeCycle(requireOrganizationId(req.auth), paramId(req.params.id!), auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const exportCycle: RequestHandler = async (req, res, next) => {
  try {
    const scope = getOfficeScope(req.auth);
    const rows = await performanceService.exportCycle(requireOrganizationId(req.auth), paramId(req.params.id!), scope);
    const format = (req.query as { format?: string }).format ?? "csv";
    if (format !== "csv") return res.json({ data: { items: rows } });
    const keys = rows[0] ? Object.keys(rows[0]) : ["number", "employee", "status"];
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", 'attachment; filename="evaluations.csv"');
    res.send(toCsv(rows, keys.map((key) => ({ key, header: key }))));
  } catch (e) {
    next(e);
  }
};

export const adminTemplates: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.listTemplates(requireOrganizationId(req.auth)) });
  } catch (e) {
    next(e);
  }
};

export const adminTemplate: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await performanceService.getTemplate(requireOrganizationId(req.auth), paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const createTemplate: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await performanceService.createTemplate(requireOrganizationId(req.auth), req.body) });
  } catch (e) {
    next(e);
  }
};

export const updateTemplate: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await performanceService.updateTemplate(requireOrganizationId(req.auth), paramId(req.params.id!), req.body)
    });
  } catch (e) {
    next(e);
  }
};
