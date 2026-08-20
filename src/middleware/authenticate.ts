import type { RequestHandler } from "express";
import { prisma } from "../database/prisma.js";
import { AppError } from "../shared/errors/app-error.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";
import { isOrgAdmin, isSuperAdmin } from "../shared/tenancy.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) return next(new AppError(401, "AUTH_REQUIRED", "Authentication required"));
  try {
    const auth = await verifyAccessToken(value.slice(7));
    if (auth.typ === "display") return next(new AppError(403, "DISPLAY_TOKEN_NOT_ALLOWED", "This token cannot access staff APIs"));
    req.auth = auth;
    next();
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid or expired"));
  }
};

export const authenticateDisplay: RequestHandler = async (req, _res, next) => {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) return next(new AppError(401, "AUTH_REQUIRED", "Authentication required"));
  try {
    const auth = await verifyAccessToken(value.slice(7));
    if (auth.typ !== "display") return next(new AppError(403, "DISPLAY_TOKEN_REQUIRED", "A display token is required"));
    const device = await prisma.displayDevice.findFirst({
      where: { id: auth.userId, isActive: true },
      select: { id: true, organizationId: true, officeId: true, boardMode: true }
    });
    if (!device) return next(new AppError(401, "DISPLAY_REVOKED", "This display is unpaired"));
    req.display = {
      displayId: device.id,
      organizationId: device.organizationId,
      officeId: device.officeId,
      boardMode: device.boardMode,
      permissions: ["display.view"]
    };
    void prisma.displayDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    next();
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid or expired"));
  }
};

export const requireNormalSession: RequestHandler = (req, _res, next) =>
  req.auth?.restricted ? next(new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Change your temporary password first")) : next();

export const requirePermission = (permission: string): RequestHandler => (req, _res, next) =>
  req.auth?.permissions.includes(permission) ? next() : next(new AppError(403, "FORBIDDEN", "You do not have permission"));

/** Tenant admin routes require organizationId on the token (org admin or office admin). */
export const requireOrgContext: RequestHandler = (req, _res, next) => {
  if (isSuperAdmin(req.auth)) return next(new AppError(403, "PLATFORM_ONLY", "Platform operators must use platform APIs"));
  if (!req.auth?.organizationId) return next(new AppError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required"));
  next();
};

/** Company-level configuration (offices, schedules, office admins). */
export const requireOrgAdmin: RequestHandler = (req, _res, next) => {
  if (!isOrgAdmin(req.auth)) return next(new AppError(403, "ORG_ADMIN_REQUIRED", "Company administrator access is required"));
  next();
};

/** Platform routes require SUPER_ADMIN. */
export const requireSuperAdmin: RequestHandler = (req, _res, next) =>
  isSuperAdmin(req.auth) ? next() : next(new AppError(403, "FORBIDDEN", "Super admin access required"));
