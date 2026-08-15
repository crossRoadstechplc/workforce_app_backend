import { z } from "zod";

export const createOfficeAdminSchema = z.object({
  email: z.string().email(),
  officeIds: z.array(z.string().uuid()).min(1),
  temporaryPassword: z.string().min(10).optional(),
  deliveryMethod: z.enum(["SHOW_PASSWORD", "SEND_EMAIL"]).default("SHOW_PASSWORD")
});

export const updateOfficeAdminOfficesSchema = z.object({
  officeIds: z.array(z.string().uuid()).min(1)
});

export const officeAdminListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional(),
  officeId: z.string().uuid().optional()
});

export const officeAdminParamsSchema = z.object({ userId: z.string().uuid() });

export const officeAdminStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
  reason: z.string().min(3)
});

export const resetOfficeAdminPasswordSchema = z.object({
  temporaryPassword: z.string().min(10).optional(),
  reason: z.string().min(3)
});
