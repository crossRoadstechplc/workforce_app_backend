import { z } from "zod";
const location = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().max(10_000),
  capturedAt: z.coerce.date()
};
export const previewCheckInSchema = z.object({ body: z.object(location) });
export const checkInSchema = z.object({ body: z.object({
  ...location,
  idempotencyKey: z.string().uuid(),
  lateReasonType: z.enum(["TRAFFIC","TRANSPORTATION","HEALTH","FAMILY_EMERGENCY","WEATHER","OTHER"]).optional(),
  lateReasonDescription: z.string().trim().min(3).max(1000).optional()
}).superRefine((value, ctx) => {
  if (value.lateReasonType === "OTHER" && !value.lateReasonDescription) ctx.addIssue({ code: "custom", path: ["lateReasonDescription"], message: "Description is required for OTHER" });
}) });
export const checkOutSchema = z.object({ body: z.object({
  ...location,
  idempotencyKey: z.string().uuid(),
  workDescription: z.string().trim().min(20).max(5000)
}) });
