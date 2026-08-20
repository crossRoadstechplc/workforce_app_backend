import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { vaultService } from "./vault.service.js";

const paramId = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0]! : value!);

export const unlockVault: RequestHandler = async (req, res, next) => {
  try {
    const { pin, scope } = req.body as { pin: string; scope: "credentials" | "subscriptions" | "reveal" };
    res.json({ data: await vaultService.unlock(req.auth!.userId, requireOrganizationId(req.auth), pin, scope) });
  } catch (e) {
    next(e);
  }
};

export const listCredentials: RequestHandler = async (req, res, next) => {
  try {
    res.json(await vaultService.listCredentials(requireOrganizationId(req.auth), req.query as never));
  } catch (e) {
    next(e);
  }
};

export const createCredential: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({
      data: await vaultService.createCredential(requireOrganizationId(req.auth), req.auth!.userId, req.body, auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const updateCredential: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await vaultService.updateCredential(requireOrganizationId(req.auth), paramId(req.params.id), req.body, auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const deleteCredential: RequestHandler = async (req, res, next) => {
  try {
    await vaultService.deleteCredential(requireOrganizationId(req.auth), paramId(req.params.id), auditContextFromRequest(req));
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};

export const revealCredential: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await vaultService.revealCredential(requireOrganizationId(req.auth), paramId(req.params.id), auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const listSubscriptions: RequestHandler = async (req, res, next) => {
  try {
    res.json(await vaultService.listSubscriptions(requireOrganizationId(req.auth), req.query as never));
  } catch (e) {
    next(e);
  }
};

export const createSubscription: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({
      data: await vaultService.createSubscription(requireOrganizationId(req.auth), req.body, auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const updateSubscription: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await vaultService.updateSubscription(requireOrganizationId(req.auth), paramId(req.params.id), req.body, auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const deleteSubscription: RequestHandler = async (req, res, next) => {
  try {
    await vaultService.deleteSubscription(requireOrganizationId(req.auth), paramId(req.params.id), auditContextFromRequest(req));
    res.status(204).end();
  } catch (e) {
    next(e);
  }
};

export const upsertPeriod: RequestHandler = async (req, res, next) => {
  try {
    const yearMonth = Array.isArray(req.params.yearMonth) ? req.params.yearMonth[0]! : req.params.yearMonth!;
    res.json({
      data: await vaultService.upsertPeriod(requireOrganizationId(req.auth), paramId(req.params.id), yearMonth, req.body, auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};

export const subscriptionSummary: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await vaultService.summary(requireOrganizationId(req.auth)) });
  } catch (e) {
    next(e);
  }
};
