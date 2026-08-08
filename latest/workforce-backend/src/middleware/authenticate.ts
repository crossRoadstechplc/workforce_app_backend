import type { RequestHandler } from "express";
import { AppError } from "../shared/errors/app-error.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";
export const authenticate: RequestHandler = async (req, _res, next) => {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) return next(new AppError(401, "AUTH_REQUIRED", "Authentication required"));
  try { req.auth = await verifyAccessToken(value.slice(7)); next(); } catch { next(new AppError(401, "INVALID_ACCESS_TOKEN", "Access token is invalid or expired")); }
};
export const requireNormalSession: RequestHandler = (req, _res, next) => req.auth?.restricted ? next(new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Change your temporary password first")) : next();
export const requirePermission = (permission: string): RequestHandler => (req, _res, next) => req.auth?.permissions.includes(permission) ? next() : next(new AppError(403, "FORBIDDEN", "You do not have permission"));
