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
import { TASK_STATUS_TO_DB, toTaskStatusLabel } from "./roles.js";
import { loadTaskLegacy } from "./serialize.js";
import type { ActorContext, LegacyTask, TaskStatusLabel } from "./types.js";
import {
  assertProjectAccess,
  assertTaskAccess,
  assertTrashAccess,
  ensureProjectMembers
} from "./visibility.js";

export function viewerFromActor(actor: ActorContext) {
  return {
    staffMemberId: actor.staffMemberId,
    permissionRole: actor.permissionRole
  };
}

function normalizeOwners(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))
    ];
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export async function createTask(input: {
  actor: ActorContext;
  title: string;
  team: string;
  description?: string;
  priority?: string;
  due?: string;
  status?: TaskStatusLabel;
  owners?: string[];
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const viewer = viewerFromActor(input.actor);
  const projectId = await getProjectIdByName(workspaceId, input.team);
  if (!projectId) throw new AppError(400, "UNKNOWN_PROJECT", `Unknown project "${input.team}".`);

  await assertProjectAccess(workspaceId, projectId, viewer);

  const { nameToId } = await buildStaffDisplayNameMap(workspaceId);
  const owners = normalizeOwners(input.owners ?? []);
  const ownerIds = owners.map((name) => nameToId.get(name)).filter((id): id is string => Boolean(id));
  await ensureProjectMembers(projectId, ownerIds);

  const taskId = randomUUID();
  const maxSort = await prisma.ttTask.aggregate({
    where: { workspaceId, status: TASK_STATUS_TO_DB[input.status ?? "To Do"] },
    _max: { sortOrder: true }
  });

  await prisma.ttTask.create({
    data: {
      id: taskId,
      workspaceId,
      projectId,
      title: input.title.trim() || "Untitled task",
      description: input.description ?? "",
      priority: input.priority === "High" ? "High" : "Low",
      due: input.due ?? "",
      status: TASK_STATUS_TO_DB[toTaskStatusLabel(input.status ?? "To Do")],
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      owners: {
        create: owners.map((name, index) => {
          const staffMemberId = nameToId.get(name);
          if (!staffMemberId) throw new AppError(400, "UNKNOWN_OWNER", `Unknown owner "${name}".`);
          return { staffMemberId, sortOrder: index };
        })
      }
    }
  });

  const task = await loadTaskLegacy(taskId, workspaceId);
  if (!task) throw new AppError(500, "TASK_LOAD_FAILED", "Could not load created task.");

  const event = await publishWorkspaceEvent({
    type: "task.created",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: taskId,
    payload: task
  });

  const actorStaffId = await resolveActorStaffId(workspaceId, input.actor.userId);
  const recipientIds = getNewAssigneeIds(new Set(), ownerIds, actorStaffId);
  await createAssignmentNotifications({
    workspaceId,
    type: "TASK_ASSIGNED",
    resourceId: taskId,
    resourceLabel: task.title,
    recipientIds,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null
  }).catch(() => undefined);

  return { task, revision: event.revision };
}

export async function updateTask(input: {
  actor: ActorContext;
  taskId: string;
  title?: string;
  description?: string;
  team?: string;
  priority?: string;
  due?: string;
  owners?: string[];
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const viewer = viewerFromActor(input.actor);
  const existing = await prisma.ttTask.findFirst({
    where: { id: input.taskId, workspaceId },
    include: { owners: true }
  });
  if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  await assertTaskAccess(workspaceId, input.taskId, viewer);

  let projectId = existing.projectId;
  if (input.team) {
    const nextProjectId = await getProjectIdByName(workspaceId, input.team);
    if (!nextProjectId) throw new AppError(400, "UNKNOWN_PROJECT", `Unknown project "${input.team}".`);
    await assertProjectAccess(workspaceId, nextProjectId, viewer);
    projectId = nextProjectId;
  }

  const { nameToId } = await buildStaffDisplayNameMap(workspaceId);
  const previousOwnerIds = new Set(existing.owners.map((owner) => owner.staffMemberId));
  let nextOwnerIds: string[] | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.ttTask.update({
      where: { id: input.taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() || "Untitled task" } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority !== undefined ? { priority: input.priority === "High" ? "High" : "Low" } : {}),
        ...(input.due !== undefined ? { due: input.due } : {}),
        projectId
      }
    });

    if (input.owners !== undefined) {
      await tx.ttTaskOwner.deleteMany({ where: { taskId: input.taskId } });
      const owners = normalizeOwners(input.owners);
      nextOwnerIds = [];
      for (let index = 0; index < owners.length; index += 1) {
        const staffMemberId = nameToId.get(owners[index]!);
        if (!staffMemberId) throw new AppError(400, "UNKNOWN_OWNER", `Unknown owner "${owners[index]}".`);
        nextOwnerIds.push(staffMemberId);
        await tx.ttTaskOwner.create({
          data: { taskId: input.taskId, staffMemberId, sortOrder: index }
        });
      }
    }
  });

  if (nextOwnerIds) await ensureProjectMembers(projectId, nextOwnerIds);

  const task = await loadTaskLegacy(input.taskId, workspaceId);
  if (!task) throw new AppError(500, "TASK_LOAD_FAILED", "Could not load updated task.");

  const event = await publishWorkspaceEvent({
    type: "task.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: task
  });

  if (nextOwnerIds) {
    const actorStaffId = await resolveActorStaffId(workspaceId, input.actor.userId);
    const recipientIds = getNewAssigneeIds(previousOwnerIds, nextOwnerIds, actorStaffId);
    await createAssignmentNotifications({
      workspaceId,
      type: "TASK_ASSIGNED",
      resourceId: input.taskId,
      resourceLabel: task.title,
      recipientIds,
      actorUserId: input.actor.userId,
      actorClientId: input.actor.clientId ?? null
    }).catch(() => undefined);
  }

  return { task, revision: event.revision };
}

export async function moveTask(input: {
  actor: ActorContext;
  taskId: string;
  status: TaskStatusLabel;
  sortOrder?: number;
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  await assertTaskAccess(workspaceId, input.taskId, viewerFromActor(input.actor));
  const existing = await prisma.ttTask.findFirst({ where: { id: input.taskId, workspaceId } });
  if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  const status = TASK_STATUS_TO_DB[toTaskStatusLabel(input.status)];
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const maxSort = await prisma.ttTask.aggregate({
      where: { workspaceId, status },
      _max: { sortOrder: true }
    });
    sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  }

  await prisma.ttTask.update({ where: { id: input.taskId }, data: { status, sortOrder } });

  const task = await loadTaskLegacy(input.taskId, workspaceId);
  if (!task) throw new AppError(500, "TASK_LOAD_FAILED", "Could not load moved task.");

  const event = await publishWorkspaceEvent({
    type: "task.moved",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: { task, status: input.status, sortOrder }
  });

  return { task, revision: event.revision };
}

export async function addTaskUpdate(input: {
  actor: ActorContext;
  taskId: string;
  text: string;
  staffMemberId?: string | null;
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  await assertTaskAccess(workspaceId, input.taskId, viewerFromActor(input.actor));
  const existing = await prisma.ttTask.findFirst({ where: { id: input.taskId, workspaceId } });
  if (!existing) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  await prisma.ttTaskUpdate.create({
    data: {
      id: randomUUID(),
      taskId: input.taskId,
      staffMemberId: input.staffMemberId ?? input.actor.staffMemberId,
      text: input.text.trim(),
      createdAt: new Date()
    }
  });

  const task = await loadTaskLegacy(input.taskId, workspaceId);
  if (!task) throw new AppError(500, "TASK_LOAD_FAILED", "Could not load task.");

  const event = await publishWorkspaceEvent({
    type: "task.update.added",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: task
  });

  return { task, revision: event.revision };
}

export async function deleteTask(input: {
  actor: ActorContext;
  taskId: string;
}): Promise<{ trashId: string; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  await assertTaskAccess(workspaceId, input.taskId, viewerFromActor(input.actor));
  const task = await loadTaskLegacy(input.taskId, workspaceId);
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  const trashId = randomUUID();
  const payload = {
    ...task,
    trashId,
    previousStatus: task.status,
    deletedAt: new Date().toISOString()
  };

  await prisma.$transaction(async (tx) => {
    await tx.ttDeletedTask.create({
      data: {
        trashId,
        workspaceId,
        previousStatus: task.status,
        deletedAt: new Date(),
        payload
      }
    });
    await tx.ttTaskUpdate.deleteMany({ where: { taskId: input.taskId } });
    await tx.ttTaskOwner.deleteMany({ where: { taskId: input.taskId } });
    await tx.ttTask.delete({ where: { id: input.taskId } });
  });

  const event = await publishWorkspaceEvent({
    type: "task.deleted",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: { trashId, task: payload }
  });

  return { trashId, revision: event.revision };
}

export async function archiveTask(input: {
  actor: ActorContext;
  taskId: string;
}): Promise<{ archivedId: string; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  await assertTaskAccess(workspaceId, input.taskId, viewerFromActor(input.actor));
  const task = await loadTaskLegacy(input.taskId, workspaceId);
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  const archivedId = randomUUID();
  const payload = {
    ...task,
    archivedId,
    archivedAt: new Date().toISOString()
  };

  await prisma.$transaction(async (tx) => {
    await tx.ttArchivedTask.create({
      data: {
        archivedId,
        workspaceId,
        archivedAt: new Date(),
        payload
      }
    });
    await tx.ttTaskUpdate.deleteMany({ where: { taskId: input.taskId } });
    await tx.ttTaskOwner.deleteMany({ where: { taskId: input.taskId } });
    await tx.ttTask.delete({ where: { id: input.taskId } });
  });

  const event = await publishWorkspaceEvent({
    type: "task.archived",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: input.taskId,
    payload: { archivedId, task: payload }
  });

  return { archivedId, revision: event.revision };
}

export async function restoreTrashTask(input: {
  actor: ActorContext;
  trashId: string;
}): Promise<{ task: LegacyTask; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  await assertTrashAccess(workspaceId, input.trashId, viewerFromActor(input.actor));
  const entry = await prisma.ttDeletedTask.findFirst({
    where: { trashId: input.trashId, workspaceId }
  });
  if (!entry) throw new AppError(404, "TRASH_NOT_FOUND", "Deleted task not found.");

  const payload = entry.payload as LegacyTask & {
    trashId?: string;
    previousStatus?: string;
    deletedAt?: string;
  };

  const { nameToId } = await buildStaffDisplayNameMap(workspaceId);
  const projectId = await getProjectIdByName(workspaceId, payload.team ?? "Unassigned");
  if (!projectId) throw new AppError(400, "UNKNOWN_PROJECT", `Unknown project "${payload.team}".`);

  const owners = normalizeOwners(payload.owners ?? payload.owner);
  const ownerIds = owners.map((name) => nameToId.get(name)).filter((id): id is string => Boolean(id));
  await ensureProjectMembers(projectId, ownerIds);

  const taskId = payload.id || randomUUID();
  const status = TASK_STATUS_TO_DB[toTaskStatusLabel(payload.previousStatus ?? payload.status)];

  const maxSort = await prisma.ttTask.aggregate({
    where: { workspaceId, status },
    _max: { sortOrder: true }
  });

  await prisma.$transaction(async (tx) => {
    await tx.ttTask.create({
      data: {
        id: taskId,
        workspaceId,
        projectId,
        title: payload.title ?? "Untitled task",
        description: payload.description ?? "",
        priority: payload.priority === "High" ? "High" : "Low",
        due: payload.due ?? "",
        status,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        owners: {
          create: owners.map((name, index) => {
            const staffMemberId = nameToId.get(name);
            if (!staffMemberId) throw new AppError(400, "UNKNOWN_OWNER", `Unknown owner "${name}".`);
            return { staffMemberId, sortOrder: index };
          })
        },
        updates: {
          create: (payload.updates ?? []).map((update) => ({
            id: update.id ?? randomUUID(),
            text: update.text,
            createdAt: new Date(update.createdAt)
          }))
        }
      }
    });
    await tx.ttDeletedTask.delete({ where: { trashId: input.trashId } });
  });

  const task = await loadTaskLegacy(taskId, workspaceId);
  if (!task) throw new AppError(500, "TASK_LOAD_FAILED", "Could not load restored task.");

  const event = await publishWorkspaceEvent({
    type: "task.restored",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "task",
    resourceId: taskId,
    payload: task
  });

  return { task, revision: event.revision };
}
