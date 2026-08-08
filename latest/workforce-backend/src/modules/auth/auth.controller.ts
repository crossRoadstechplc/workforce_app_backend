import type { RequestHandler } from "express";
import { authService } from "./auth.service.js";
import { changePasswordSchema, loginSchema, refreshSchema } from "./auth.schemas.js";
import { AppError } from "../../shared/errors/app-error.js";

export const login: RequestHandler = async (req, res) => res.json(await authService.login(loginSchema.parse(req.body)));
export const refresh: RequestHandler = async (req, res) => res.json(await authService.refresh(refreshSchema.parse(req.body)));
export const changePassword: RequestHandler = async (req, res) => { if (!req.auth) throw new AppError(401,"AUTH_REQUIRED","Authentication required"); const body=changePasswordSchema.parse(req.body); res.json(await authService.changePassword(req.auth.userId, body.currentPassword, body.newPassword)); };
export const me: RequestHandler = async (req, res) => { if (!req.auth) throw new AppError(401,"AUTH_REQUIRED","Authentication required"); const result=await authService.identity(req.auth.userId); res.json({ id: result.user.id, email: result.user.email, mustChangePassword: result.user.mustChangePassword, roles: result.roles, permissions: result.permissions }); };
export const logout: RequestHandler = async (req, res) => { if (!req.auth) throw new AppError(401,"AUTH_REQUIRED","Authentication required"); const body=zRefresh(req.body); await authService.logout(req.auth.userId, body.refreshToken); res.status(204).send(); };
function zRefresh(body: unknown){ return refreshSchema.pick({refreshToken:true}).parse(body); }
