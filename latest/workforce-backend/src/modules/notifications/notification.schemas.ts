import { z } from "zod";
export const listNotificationsSchema = z.object({ query: z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(["true","false"]).transform(v => v === "true").optional()
}) });
export const notificationIdSchema = z.object({ params: z.object({ notificationId: z.string().uuid() }) });
export const deviceSchema = z.object({ body: z.object({ deviceId: z.string().min(3).max(200), fcmToken: z.string().min(20).max(4096), platform: z.enum(["ANDROID","IOS","WEB"]), appVersion: z.string().max(50).optional() }) });
export const deviceIdSchema = z.object({ params: z.object({ deviceId: z.string().min(3).max(200) }) });
