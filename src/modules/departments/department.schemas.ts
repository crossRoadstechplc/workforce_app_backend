import { z } from "zod";

const departmentBase = z.object({
  name: z.string().trim().min(2).max(150)
});

export const createDepartmentSchema = departmentBase;
export const updateDepartmentSchema = departmentBase.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const departmentParamsSchema = z.object({ departmentId: z.string().uuid() });
export const departmentStatusSchema = z.object({ isActive: z.boolean(), reason: z.string().trim().min(3).max(500) });
export const departmentListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
});
