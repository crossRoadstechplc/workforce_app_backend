import { z } from "zod";

const clientChannel = z.enum(["MOBILE", "DESKTOP"]);
const locationFields = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().positive().max(10_000).optional(),
  capturedAt: z.coerce.date().optional()
};
const photoUrl = z.string().url().max(2048).optional();

export const previewCheckInSchema = z.object({
  body: z.object({
    clientChannel,
    ...locationFields
  })
});
export const uploadAttendancePhotoSchema = z.object({
  body: z.object({
    purpose: z.enum(["CHECK_IN", "CHECK_OUT"]),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
    imageBase64: z.string().min(100).max(12_000_000)
  })
});
export const checkInSchema = z.object({ body: z.object({
  clientChannel,
  ...locationFields,
  idempotencyKey: z.string().uuid(),
  photoUrl: photoUrl,
  lateReasonType: z.enum(["TRAFFIC","TRANSPORTATION","HEALTH","FAMILY_EMERGENCY","WEATHER","OTHER"]).optional(),
  lateReasonDescription: z.string().trim().min(3).max(1000).optional()
}).superRefine((value, ctx) => {
  if (value.lateReasonType === "OTHER" && !value.lateReasonDescription) ctx.addIssue({ code: "custom", path: ["lateReasonDescription"], message: "Description is required for OTHER" });
}) });
export const checkOutSchema = z.object({ body: z.object({
  clientChannel,
  ...locationFields,
  idempotencyKey: z.string().uuid(),
  /** Optional — omit or leave empty to check out without a worksheet. */
  workDescription: z.string().trim().max(5000).optional(),
  photoUrl: photoUrl
}) });
export const attendanceConfigUpdateSchema = z.object({
  body: z.object({
    photoRequiredEnabled: z.boolean().optional(),
    desktopSkipLocationEnabled: z.boolean().optional()
  }).refine((value) => value.photoRequiredEnabled !== undefined || value.desktopSkipLocationEnabled !== undefined, {
    message: "At least one attendance setting is required"
  })
});
