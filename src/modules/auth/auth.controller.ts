import type { RequestHandler } from "express";
import { authService } from "./auth.service.js";
import { changePasswordSchema, loginSchema, refreshSchema, selectContextSchema, switchContextSchema } from "./auth.schemas.js";
import { AppError } from "../../shared/errors/app-error.js";

export const login: RequestHandler = async (req, res) => res.json(await authService.login(loginSchema.parse(req.body)));
export const refresh: RequestHandler = async (req, res) => res.json(await authService.refresh(refreshSchema.parse(req.body)));
export const selectContext: RequestHandler = async (req, res) => res.json(await authService.selectContext(selectContextSchema.parse(req.body)));
export const switchContext: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const body = switchContextSchema.parse(req.body);
  res.json(await authService.switchContext(req.auth.userId, body.contextKey, { deviceId: body.deviceId, refreshToken: body.refreshToken }));
};
export const listContexts: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  res.json(await authService.listContexts(req.auth.userId));
};
export const changePassword: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const body = changePasswordSchema.parse(req.body);
  res.json(await authService.changePassword(req.auth.userId, body.currentPassword, body.newPassword, req.auth.activeContext?.key));
};
export const me: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const result = await authService.identity(req.auth.userId, req.auth.activeContext?.key);
  res.json({
    id: result.user.id,
    email: result.user.email,
    mustChangePassword: result.user.mustChangePassword,
    roles: result.roles,
    permissions: result.permissions,
    organizationId: result.organizationId,
    organization: result.organization,
    officeIds: result.officeIds,
    offices: result.offices,
    employee: result.employee,
    activeContext: result.activeContext
  });
};
export const logout: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
  const body = refreshSchema.pick({ refreshToken: true }).parse(req.body);
  await authService.logout(req.auth.userId, body.refreshToken);
  res.status(204).send();
};
