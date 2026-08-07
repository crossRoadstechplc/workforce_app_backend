import { z } from "zod";

const officeBase = z.object({
  name: z.string().trim().min(2).max(150),
  address: z.string().trim().max(500).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  allowedRadiusMeters: z.coerce.number().int().min(10).max(10000),
  maximumAccuracyMeters: z.coerce.number().int().min(5).max(5000).default(100),
  timezone: z.string().trim().min(1).max(100).default("Africa/Addis_Ababa")
});

export const createOfficeSchema = officeBase;
export const updateOfficeSchema = officeBase.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const officeParamsSchema = z.object({ officeId: z.string().uuid() });
export const officeStatusSchema = z.object({ isActive: z.boolean(), reason: z.string().trim().min(3).max(500) });
export const officeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
});
