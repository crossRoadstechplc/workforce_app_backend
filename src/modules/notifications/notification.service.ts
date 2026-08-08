import { prisma } from "../../database/prisma.js";
import { emitToUser } from "../../realtime/socket.server.js";
import { sendPushToUser } from "./push.service.js";
import { AppError } from "../../shared/errors/app-error.js";

export async function deliverNotification(notification: { id: string; userId: string; type: string; title: string; message: string; relatedEntityType?: string | null; relatedEntityId?: string | null }) {
  const payload = { id: notification.id, type: notification.type, title: notification.title, message: notification.message, relatedEntityType: notification.relatedEntityType, relatedEntityId: notification.relatedEntityId };
  emitToUser(notification.userId, "notification.created", payload);
  await sendPushToUser(notification.userId, notification.title, notification.message, {
    notificationId: notification.id,
    type: notification.type,
    ...(notification.relatedEntityId ? { relatedEntityId: notification.relatedEntityId } : {})
  }).catch(() => undefined);
}

export const notificationService = {
  async list(userId: string, input: { page: number; pageSize: number; unreadOnly?: boolean }) {
    const skip = (input.page - 1) * input.pageSize;
    const where = { userId, ...(input.unreadOnly ? { isRead: false } : {}) };
    const [items, total, unread] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: input.pageSize }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } })
    ]);
    return { items, meta: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.ceil(total / input.pageSize) }, unreadCount: unread };
  },
  async markRead(userId: string, id: string) {
    const item = await prisma.notification.findFirst({ where: { id, userId } });
    if (!item) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
    return prisma.notification.update({ where: { id }, data: { isRead: true, readAt: item.readAt ?? new Date() } });
  },
  async markAllRead(userId: string) {
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return { success: true };
  },
  async registerDevice(userId: string, input: { deviceId: string; fcmToken: string; platform: "ANDROID" | "IOS" | "WEB"; appVersion?: string }) {
    return prisma.userDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: input.deviceId } },
      update: { fcmToken: input.fcmToken, platform: input.platform, appVersion: input.appVersion, isActive: true, lastSeenAt: new Date() },
      create: { userId, ...input, isActive: true }
    });
  },
  async removeDevice(userId: string, deviceId: string) {
    await prisma.userDevice.updateMany({ where: { userId, deviceId }, data: { isActive: false } });
    return { success: true };
  }
};
