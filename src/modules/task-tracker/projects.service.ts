import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { publishWorkspaceEvent } from "./events/notify.js";
import {
  createAssignmentNotifications,
  getNewAssigneeIds,
  resolveActorStaffId
} from "./notifications.service.js";
import { viewerFromActor } from "./tasks.service.js";
import type { ActorContext } from "./types.js";
import { assertProjectAccess, ensureProjectMembers } from "./visibility.js";

export async function createProject(input: {
  actor: ActorContext;
  name: string;
}): Promise<{ id: string; name: string; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const maxSort = await prisma.ttProject.aggregate({
    where: { workspaceId },
    _max: { sortOrder: true }
  });

  const project = await prisma.ttProject.create({
    data: {
      workspaceId,
      name: input.name.trim(),
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1
    }
  });

  await ensureProjectMembers(project.id, [input.actor.staffMemberId]);

  const published = await publishWorkspaceEvent({
    type: "project.created",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: project.id,
    payload: { id: project.id, name: project.name }
  });

  return { id: project.id, name: project.name, revision: published.revision };
}

export async function updateProject(input: {
  actor: ActorContext;
  projectId: string;
  name?: string;
  leaderId?: string | null;
}): Promise<{ id: string; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttProject.findFirst({
    where: { id: input.projectId, workspaceId }
  });
  if (!existing) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");

  await assertProjectAccess(workspaceId, input.projectId, viewerFromActor(input.actor));

  const project = await prisma.ttProject.update({
    where: { id: input.projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {})
    }
  });

  const published = await publishWorkspaceEvent({
    type: "project.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: project.id,
    payload: { id: project.id, name: project.name, leaderId: project.leaderId }
  });

  return { id: project.id, revision: published.revision };
}

export async function deleteProject(input: {
  actor: ActorContext;
  projectId: string;
}): Promise<{ revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttProject.findFirst({
    where: { id: input.projectId, workspaceId }
  });
  if (!existing) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");

  await assertProjectAccess(workspaceId, input.projectId, viewerFromActor(input.actor));

  const taskCount = await prisma.ttTask.count({ where: { projectId: input.projectId } });
  if (taskCount > 0) {
    throw new AppError(400, "PROJECT_HAS_TASKS", "Cannot delete a project that still has tasks.");
  }

  await prisma.ttProjectMember.deleteMany({ where: { projectId: input.projectId } });
  await prisma.ttProject.delete({ where: { id: input.projectId } });

  const published = await publishWorkspaceEvent({
    type: "project.deleted",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: input.projectId,
    payload: { id: input.projectId }
  });

  return { revision: published.revision };
}

export async function setProjectMembers(input: {
  actor: ActorContext;
  projectId: string;
  memberIds: string[];
}): Promise<{ revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttProject.findFirst({
    where: { id: input.projectId, workspaceId }
  });
  if (!existing) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");

  await assertProjectAccess(workspaceId, input.projectId, viewerFromActor(input.actor));

  const previousMembers = await prisma.ttProjectMember.findMany({
    where: { projectId: input.projectId },
    select: { staffMemberId: true }
  });
  const previousMemberIds = new Set(previousMembers.map((row) => row.staffMemberId));
  const memberIds = [...new Set(input.memberIds)];

  await prisma.$transaction(async (tx) => {
    await tx.ttProjectMember.deleteMany({ where: { projectId: input.projectId } });
    if (memberIds.length > 0) {
      await tx.ttProjectMember.createMany({
        data: memberIds.map((staffMemberId) => ({
          projectId: input.projectId,
          staffMemberId
        }))
      });
    }
  });

  const published = await publishWorkspaceEvent({
    type: "project.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "project",
    resourceId: input.projectId,
    payload: { id: input.projectId, memberIds }
  });

  const actorStaffId = await resolveActorStaffId(workspaceId, input.actor.userId);
  const recipientIds = getNewAssigneeIds(previousMemberIds, memberIds, actorStaffId);
  await createAssignmentNotifications({
    workspaceId,
    type: "PROJECT_ASSIGNED",
    resourceId: input.projectId,
    resourceLabel: existing.name,
    recipientIds,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null
  }).catch(() => undefined);

  return { revision: published.revision };
}
