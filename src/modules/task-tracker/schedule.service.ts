import { randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { buildStaffDisplayNameMap, getProjectIdByName } from "./context.js";
import { publishWorkspaceEvent } from "./events/notify.js";
import {
  createAssignmentNotifications,
  getNewAssigneeIds,
  resolveActorStaffId
} from "./notifications.service.js";
import { loadScheduleLegacy } from "./serialize.js";
import { viewerFromActor } from "./tasks.service.js";
import type { ActorContext, ScheduleEvent } from "./types.js";
import {
  assertProjectAccess,
  assertScheduleEventAccess,
  getProjectMemberStaffIds,
  mergeScheduleRecipientIds
} from "./visibility.js";

export async function createScheduleEvent(input: {
  actor: ActorContext;
  event: Omit<ScheduleEvent, "id"> & { id?: string };
}): Promise<{ event: ScheduleEvent; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const eventId = input.event.id ?? randomUUID();
  const projectId = input.event.project ? await getProjectIdByName(workspaceId, input.event.project) : null;

  if (projectId) {
    await assertProjectAccess(workspaceId, projectId, viewerFromActor(input.actor));
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspaceId);
  const guestStaffIds = (input.event.guests ?? [])
    .map((name) => nameToId.get(name))
    .filter((id): id is string => Boolean(id));

  await prisma.ttScheduleEvent.create({
    data: {
      id: eventId,
      workspaceId,
      projectId,
      title: input.event.title.trim() || "Untitled",
      start: new Date(input.event.start),
      end: new Date(input.event.end),
      allDay: Boolean(input.event.allDay),
      description: input.event.description ?? "",
      location: input.event.location ?? "",
      color: input.event.color,
      guests: {
        create: guestStaffIds.map((staffMemberId) => ({ staffMemberId }))
      }
    }
  });

  const event = await loadScheduleLegacy(eventId, workspaceId);
  if (!event) throw new AppError(500, "SCHEDULE_LOAD_FAILED", "Could not load created event.");

  const published = await publishWorkspaceEvent({
    type: "schedule.created",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "schedule",
    resourceId: eventId,
    payload: event
  });

  const actorStaffId = await resolveActorStaffId(workspaceId, input.actor.userId);
  const projectMemberIds = projectId ? await getProjectMemberStaffIds(projectId) : [];
  const allRecipientIds = mergeScheduleRecipientIds(projectMemberIds, guestStaffIds);
  const recipientIds = getNewAssigneeIds(new Set(), allRecipientIds, actorStaffId);
  await createAssignmentNotifications({
    workspaceId,
    type: "SCHEDULE_INVITED",
    resourceId: eventId,
    resourceLabel: event.title,
    scheduleStart: event.start,
    recipientIds,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null
  }).catch(() => undefined);

  return { event, revision: published.revision };
}

export async function updateScheduleEvent(input: {
  actor: ActorContext;
  eventId: string;
  patch: Partial<ScheduleEvent>;
}): Promise<{ event: ScheduleEvent; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttScheduleEvent.findFirst({
    where: { id: input.eventId, workspaceId },
    include: { guests: true }
  });
  if (!existing) throw new AppError(404, "SCHEDULE_NOT_FOUND", "Schedule event not found.");

  await assertScheduleEventAccess(workspaceId, input.eventId, viewerFromActor(input.actor));

  const previousGuestIds = new Set(existing.guests.map((guest) => guest.staffMemberId));
  const previousProjectId = existing.projectId;
  let nextGuestIds: string[] | null = null;

  let projectId = existing.projectId;
  if (input.patch.project !== undefined) {
    projectId = input.patch.project ? await getProjectIdByName(workspaceId, input.patch.project) : null;
    if (projectId) {
      await assertProjectAccess(workspaceId, projectId, viewerFromActor(input.actor));
    }
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspaceId);

  await prisma.$transaction(async (tx) => {
    await tx.ttScheduleEvent.update({
      where: { id: input.eventId },
      data: {
        ...(input.patch.title !== undefined ? { title: input.patch.title } : {}),
        ...(input.patch.start !== undefined ? { start: new Date(input.patch.start) } : {}),
        ...(input.patch.end !== undefined ? { end: new Date(input.patch.end) } : {}),
        ...(input.patch.allDay !== undefined ? { allDay: input.patch.allDay } : {}),
        ...(input.patch.description !== undefined ? { description: input.patch.description } : {}),
        ...(input.patch.location !== undefined ? { location: input.patch.location } : {}),
        ...(input.patch.color !== undefined ? { color: input.patch.color } : {}),
        projectId
      }
    });

    if (input.patch.guests !== undefined) {
      await tx.ttScheduleEventGuest.deleteMany({ where: { eventId: input.eventId } });
      nextGuestIds = [];
      for (const name of input.patch.guests) {
        const staffMemberId = nameToId.get(name);
        if (!staffMemberId) continue;
        nextGuestIds.push(staffMemberId);
        await tx.ttScheduleEventGuest.create({
          data: { eventId: input.eventId, staffMemberId }
        });
      }
    }
  });

  const event = await loadScheduleLegacy(input.eventId, workspaceId);
  if (!event) throw new AppError(500, "SCHEDULE_LOAD_FAILED", "Could not load updated event.");

  const published = await publishWorkspaceEvent({
    type: "schedule.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "schedule",
    resourceId: input.eventId,
    payload: event
  });

  const recipientsChanged = input.patch.guests !== undefined || input.patch.project !== undefined;
  if (recipientsChanged) {
    const currentGuestIds = nextGuestIds ?? [...previousGuestIds];
    const previousProjectMemberIds = previousProjectId ? await getProjectMemberStaffIds(previousProjectId) : [];
    const nextProjectMemberIds = projectId ? await getProjectMemberStaffIds(projectId) : [];
    const previousRecipientIds = mergeScheduleRecipientIds(previousProjectMemberIds, [...previousGuestIds]);
    const nextRecipientIds = mergeScheduleRecipientIds(nextProjectMemberIds, currentGuestIds);
    const actorStaffId = await resolveActorStaffId(workspaceId, input.actor.userId);
    const recipientIds = getNewAssigneeIds(new Set(previousRecipientIds), nextRecipientIds, actorStaffId);
    await createAssignmentNotifications({
      workspaceId,
      type: "SCHEDULE_INVITED",
      resourceId: input.eventId,
      resourceLabel: event.title,
      scheduleStart: event.start,
      recipientIds,
      actorUserId: input.actor.userId,
      actorClientId: input.actor.clientId ?? null
    }).catch(() => undefined);
  }

  return { event, revision: published.revision };
}

export async function deleteScheduleEvent(input: {
  actor: ActorContext;
  eventId: string;
}): Promise<{ revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttScheduleEvent.findFirst({
    where: { id: input.eventId, workspaceId }
  });
  if (!existing) throw new AppError(404, "SCHEDULE_NOT_FOUND", "Schedule event not found.");

  await assertScheduleEventAccess(workspaceId, input.eventId, viewerFromActor(input.actor));

  await prisma.ttScheduleEventGuest.deleteMany({ where: { eventId: input.eventId } });
  await prisma.ttScheduleEvent.delete({ where: { id: input.eventId } });

  const published = await publishWorkspaceEvent({
    type: "schedule.deleted",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "schedule",
    resourceId: input.eventId,
    payload: { id: input.eventId }
  });

  return { revision: published.revision };
}
