import { z } from "zod";
const location = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().max(10_000),
  capturedAt: z.coerce.date()
};
const photoUrl = z.string().url().max(2048).optional();
export const previewCheckInSchema = z.object({ body: z.object(location) });
export const uploadAttendancePhotoSchema = z.object({
  body: z.object({
    purpose: z.enum(["CHECK_IN", "CHECK_OUT"]),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
    imageBase64: z.string().min(100).max(12_000_000)
  })
});
export const checkInSchema = z.object({ body: z.object({
  ...location,
  idempotencyKey: z.string().uuid(),
  photoUrl: photoUrl,
  lateReasonType: z.enum(["TRAFFIC","TRANSPORTATION","HEALTH","FAMILY_EMERGENCY","WEATHER","OTHER"]).optional(),
  lateReasonDescription: z.string().trim().min(3).max(1000).optional()
}).superRefine((value, ctx) => {
  if (value.lateReasonType === "OTHER" && !value.lateReasonDescription) ctx.addIssue({ code: "custom", path: ["lateReasonDescription"], message: "Description is required for OTHER" });
}) });
export const checkOutSchema = z.object({ body: z.object({
  ...location,
  idempotencyKey: z.string().uuid(),
  workDescription: z.string().trim().min(20).max(5000),
  photoUrl: photoUrl
}) });
