import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const daySchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  checkInTime: z.string().regex(timePattern, "Use HH:mm format"),
  checkOutTime: z.string().regex(timePattern, "Use HH:mm format")
}).superRefine((day, ctx) => {
  if (day.checkOutTime <= day.checkInTime) {
    ctx.addIssue({
      code: "custom",
      message: "Checkout time must be after check-in time",
      path: ["checkOutTime"]
    });
  }
});

const scheduleObject = z.object({
  name: z.string().trim().min(2).max(150),
  lateGraceMinutes: z.coerce.number().int().min(0).max(240).default(0),
  timezone: z.string().trim().min(1).max(100).default("Africa/Addis_Ababa"),
  days: z
    .array(daySchema)
    .min(1, "At least one working day is required")
    .superRefine((days, ctx) => {
      const seen = new Set<number>();
      for (const [i, day] of days.entries()) {
        if (seen.has(day.weekday)) {
          ctx.addIssue({ code: "custom", message: "Duplicate weekday", path: [i, "weekday"] });
        }
        seen.add(day.weekday);
      }
    })
});

export const createScheduleSchema = scheduleObject;
export const updateScheduleSchema = scheduleObject
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const scheduleParamsSchema = z.object({ scheduleId: z.string().uuid() });
export const scheduleStatusSchema = z.object({ isActive: z.boolean(), reason: z.string().trim().min(3).max(500) });
export const scheduleListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional()
});

export type ScheduleDayInput = z.infer<typeof daySchema>;
export type ScheduleInput = z.infer<typeof scheduleObject>;
