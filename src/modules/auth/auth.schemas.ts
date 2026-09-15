import { z } from "zod";
import { easyPasswordSchema } from "../../shared/password.js";

export const loginSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(6),
  deviceId: z.string().max(200).optional().nullable(),
  organizationSlug: z.string().min(2).max(80).optional().nullable(),
  contextKey: z.string().min(3).max(120).optional().nullable(),
  lastContextKey: z.string().min(3).max(120).optional().nullable()
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20), deviceId: z.string().max(200).optional() });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: easyPasswordSchema
});
export const selectContextSchema = z.object({
  preAuthToken: z.string().min(20),
  contextKey: z.string().min(3).max(120),
  deviceId: z.string().max(200).optional()
});
export const switchContextSchema = z.object({
  contextKey: z.string().min(3).max(120),
  deviceId: z.string().max(200).optional(),
  refreshToken: z.string().min(20).optional()
});
