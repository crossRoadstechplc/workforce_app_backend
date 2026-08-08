import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const scheduleBase = z.object({
  name: z.string().trim().min(2).max(150),
  checkInTime: z.string().regex(timePattern, "Use HH:mm format"),
  checkOutTime: z.string().regex(timePattern, "Use HH:mm format"),
  lateGraceMinutes: z.coerce.number().int().min(0).max(240).default(0),
  workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1).transform((days) => [...new Set(days)].sort()),
  timezone: z.string().trim().min(1).max(100).default("Africa/Addis_Ababa")
}).refine((value) => value.checkOutTime > value.checkInTime, { message: "Checkout time must be after check-in time", path: ["checkOutTime"] });

export const createScheduleSchema = scheduleBase;
export const updateScheduleSchema = scheduleBase.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const scheduleParamsSchema = z.object({ scheduleId: z.string().uuid() });
export const scheduleStatusSchema = z.object({ isActive: z.boolean(), reason: z.string().trim().min(3).max(500) });
export const scheduleListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
});
