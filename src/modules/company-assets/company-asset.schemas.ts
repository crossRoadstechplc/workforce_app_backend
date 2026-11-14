import { z } from "zod";

export const companyAssetTypes = ["LAPTOP", "DESKTOP", "CAR", "OTHER"] as const;
export const companyAssetStatuses = ["PENDING", "ACCEPTED", "DECLINED", "RETURNED"] as const;

const optionalNote = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable().optional()
);

export const assetDraftSchema = z.object({
  type: z.enum(companyAssetTypes),
  name: z.string().trim().min(1).max(120),
  identifier: z.string().trim().min(1).max(120),
  notes: optionalNote
});

export const assetDraftListSchema = z.array(assetDraftSchema).max(20);

export type AssetDraft = z.infer<typeof assetDraftSchema>;

export const createCompanyAssetSchema = assetDraftSchema.extend({
  employeeId: z.string().uuid()
});

export const updateCompanyAssetSchema = z
  .object({
    type: z.enum(companyAssetTypes).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    identifier: z.string().trim().min(1).max(120).optional(),
    notes: optionalNote
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const companyAssetIdSchema = z.object({
  id: z.string().uuid()
});

export const respondCompanyAssetSchema = z.object({
  note: z.string().trim().max(1000).optional()
});

export const declineCompanyAssetSchema = z.object({
  note: z.string().trim().min(3).max(1000)
});

export const returnCompanyAssetSchema = z.object({
  note: optionalNote
});

export const adminCompanyAssetListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(companyAssetStatuses).optional(),
  employeeId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional()
});
