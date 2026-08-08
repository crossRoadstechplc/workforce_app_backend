import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";

function messaging() {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    }) });
  }
  return getMessaging();
}

export async function sendPushToUser(userId: string, title: string, body: string, data: Record<string, string> = {}) {
  const client = messaging();
  if (!client) return;
  const devices = await prisma.userDevice.findMany({ where: { userId, isActive: true }, select: { id: true, fcmToken: true } });
  if (!devices.length) return;
  const response = await client.sendEachForMulticast({ tokens: devices.map((d) => d.fcmToken), notification: { title, body }, data });
  const invalidIds = devices.filter((_, i) => response.responses[i] && !response.responses[i]!.success && [
    "messaging/registration-token-not-registered", "messaging/invalid-registration-token"
  ].includes(response.responses[i]!.error?.code ?? "")).map((d) => d.id);
  if (invalidIds.length) await prisma.userDevice.updateMany({ where: { id: { in: invalidIds } }, data: { isActive: false } });
  if (response.failureCount) logger.warn({ userId, failureCount: response.failureCount }, "Some push notifications failed");
}
