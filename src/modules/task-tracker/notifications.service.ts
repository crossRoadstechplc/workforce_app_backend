import { prisma } from "../../database/prisma.js";
import { publishWorkspaceEvent } from "./events/notify.js";
import type { NotificationRecord } from "./types.js";

type NotificationType = NotificationRecord["type"];

export function getNewAssigneeIds(
  before: Set<string>,
  after: string[],
  actorStaffId: string | null
): string[] {
  return after.filter((id) => !before.has(id) && (actorStaffId === null || id !== actorStaffId));
}

export async function resolveActorStaffId(
  workspaceId: string,
  actorUserId: string | null | undefined
): Promise<string | null> {
  if (!actorUserId) return null;
  const member = await prisma.ttStaffMember.findFirst({
    where: { workspaceId, userId: actorUserId },
    select: { id: true }
  });
  return member?.id ?? null;
}

function formatScheduleDate(startIso: string): string {
  const date = new Date(startIso);
  if (Number.isNaN(date.getTime())) return startIso;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildNotificationCopy(input: {
  type: NotificationType;
  resourceLabel: string;
  scheduleStart?: string;
}): { title: string; body: string } {
  switch (input.type) {
    case "TASK_ASSIGNED":
      return { title: "Task assignment", body: `You were assigned to "${input.resourceLabel}".` };
    case "PROJECT_ASSIGNED":
      return { title: "Project assignment", body: `You were added to project "${input.resourceLabel}".` };
    case "SCHEDULE_INVITED":
      return {
        title: "Schedule invitation",
        body: input.scheduleStart
          ? `You were invited to "${input.resourceLabel}" on ${formatScheduleDate(input.scheduleStart)}.`
          : `You were invited to "${input.resourceLabel}".`
      };
    default:
      return { title: "Notification", body: input.resourceLabel };
  }
}

function resourceTypeForNotification(type: NotificationType): string {
  switch (type) {
    case "TASK_ASSIGNED":
      return "task";
    case "PROJECT_ASSIGNED":
      return "project";
    case "SCHEDULE_INVITED":
      return "schedule";
    default:
      return "unknown";
  }
}

function mapNotificationRow(row: {
  id: string;
  workspaceId: string;
  recipientId: string;
  type: NotificationType | string;
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
  actorStaffId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recipientId: row.recipientId,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorStaffId: row.actorStaffId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

export async function createAssignmentNotifications(input: {
  workspaceId: string;
  type: NotificationType;
  resourceId: string;
  resourceLabel: string;
  scheduleStart?: string;
  recipientIds: string[];
  actorUserId?: string | null;
  actorClientId?: string | null;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const actorStaffId = await resolveActorStaffId(input.workspaceId, input.actorUserId);
  const { title, body } = buildNotificationCopy({
    type: input.type,
    resourceLabel: input.resourceLabel,
    scheduleStart: input.scheduleStart
  });
  const resourceType = resourceTypeForNotification(input.type);

  const recipients = await prisma.ttStaffMember.findMany({
    where: {
      workspaceId: input.workspaceId,
      id: { in: input.recipientIds }
    },
    select: { id: true }
  });

  for (const recipient of recipients) {
    const row = await prisma.ttNotification.create({
      data: {
        workspaceId: input.workspaceId,
        recipientId: recipient.id,
        type: input.type,
        title,
        body,
        resourceType,
        resourceId: input.resourceId,
        actorStaffId
      }
    });

    const notification = mapNotificationRow(row);
    await publishWorkspaceEvent({
      type: "notification.created",
      workspaceId: notification.workspaceId,
      actorUserId: input.actorUserId ?? null,
      actorClientId: input.actorClientId ?? null,
      resource: "notification",
      resourceId: notification.id,
      payload: notification
    });
  }
}

export async function listNotificationsForRecipient(
  recipientId: string,
  limit = 50
): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.ttNotification.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: limit
    }),
    prisma.ttNotification.count({
      where: { recipientId, readAt: null }
    })
  ]);

  const notifications = rows
    .map(mapNotificationRow)
    .sort((a, b) => {
      const aUnread = a.readAt === null ? 0 : 1;
      const bUnread = b.readAt === null ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return { notifications, unreadCount };
}

export async function markNotificationRead(
  notificationId: string,
  recipientId: string
): Promise<NotificationRecord | null> {
  const existing = await prisma.ttNotification.findFirst({
    where: { id: notificationId, recipientId }
  });
  if (!existing) return null;

  const row = await prisma.ttNotification.update({
    where: { id: notificationId },
    data: { readAt: existing.readAt ?? new Date() }
  });

  return mapNotificationRow(row);
}

export async function markAllNotificationsRead(recipientId: string): Promise<number> {
  const result = await prisma.ttNotification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() }
  });
  return result.count;
}
