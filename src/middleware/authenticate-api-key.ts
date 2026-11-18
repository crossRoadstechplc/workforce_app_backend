import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../database/prisma.js";
import { AppError } from "../shared/errors/app-error.js";
import { hashApiKey, parseApiKey } from "../modules/integrations/api-key.js";

const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/** Server-to-server auth for the external integration API (`X-API-Key: wfk_live_…`). */
export const authenticateApiKey: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header("x-api-key");
    if (!header) return next(new AppError(401, "API_KEY_REQUIRED", "Send your API key in the X-API-Key header"));
    const parsed = parseApiKey(header);
    if (!parsed) return next(new AppError(401, "INVALID_API_KEY", "API key is invalid"));

    const integration = await prisma.apiIntegration.findUnique({
      where: { keyHash: hashApiKey(parsed.apiKey) },
      select: {
        id: true,
        name: true,
        organizationId: true,
        officeIds: true,
        isActive: true,
        revokedAt: true,
        lastUsedAt: true,
        organization: { select: { isActive: true } }
      }
    });
    if (!integration) return next(new AppError(401, "INVALID_API_KEY", "API key is invalid"));
    if (integration.revokedAt) return next(new AppError(401, "API_KEY_REVOKED", "This API key was revoked"));
    if (!integration.isActive) return next(new AppError(403, "API_KEY_DISABLED", "This API key is paused by the company admin"));
    if (!integration.organization.isActive) return next(new AppError(403, "ORGANIZATION_INACTIVE", "The company account is inactive"));

    req.integration = {
      integrationId: integration.id,
      organizationId: integration.organizationId,
      officeIds: integration.officeIds,
      name: integration.name
    };
    if (!integration.lastUsedAt || Date.now() - integration.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
      void prisma.apiIntegration.update({ where: { id: integration.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    next();
  } catch (error) {
    next(error);
  }
};

/** 60 requests per minute per API key (on top of the global per-IP limiter). */
export const apiKeyRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `integration:${req.integration?.integrationId ?? "anonymous"}`,
  handler: (req, res) =>
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many requests for this API key. Try again in a minute.", requestId: req.id }
    })
});
