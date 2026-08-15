import { z } from "zod";

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  isActive: z.boolean().optional(),
  adminEmail: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  sendInvite: z.boolean().optional()
}).refine((value) => !value.sendInvite || !!value.adminEmail, {
  message: "adminEmail is required when sendInvite is true",
  path: ["adminEmail"]
});

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  isActive: z.boolean()
}).partial();

export const organizationStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(500)
});

export const organizationListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional()
});

export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid()
});

export const orgAdminCreateSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email().transform((v) => v.toLowerCase()),
  temporaryPassword: z.string().min(10).optional(),
  deliveryMethod: z.enum(["SHOW_PASSWORD", "SEND_EMAIL"]).default("SHOW_PASSWORD")
});

export const orgAdminListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  organizationId: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional()
});

export const orgAdminParamsSchema = z.object({
  userId: z.string().uuid()
});

export const orgAdminStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
  reason: z.string().trim().min(3).max(500)
});

export const orgAdminResetPasswordSchema = z.object({
  temporaryPassword: z.string().min(10).optional(),
  reason: z.string().trim().min(3).max(500)
});
