import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PERMISSION_ROLE_FROM_DB, type TtPermissionRoleDb } from "./roles.js";
import type { PermissionRoleLabel } from "./types.js";

export type WorkspaceViewer = {
  staffMemberId: string;
  permissionRole: PermissionRoleLabel;
};

export function canSeeAllProjects(role: PermissionRoleLabel): boolean {
  return role === "Super Admin" || role === "Admin";
}

/** Returns null when the viewer can see all projects; otherwise a set of accessible project IDs. */
export async function getAccessibleProjectIds(
  workspaceId: string,
  staffMemberId: string,
  role: PermissionRoleLabel
): Promise<Set<string> | null> {
  if (canSeeAllProjects(role)) return null;

  const projects = await prisma.ttProject.findMany({
    where: {
      workspaceId,
      OR: [{ leaderId: staffMemberId }, { members: { some: { staffMemberId } } }]
    },
    select: { id: true }
  });

  return new Set(projects.map((project) => project.id));
}

export async function hasProjectAccess(
  workspaceId: string,
  projectId: string,
  viewer: WorkspaceViewer
): Promise<boolean> {
  const accessible = await getAccessibleProjectIds(workspaceId, viewer.staffMemberId, viewer.permissionRole);
  if (accessible === null) return true;
  return accessible.has(projectId);
}

export async function assertProjectAccess(
  workspaceId: string,
  projectId: string,
  viewer: WorkspaceViewer
): Promise<void> {
  const allowed = await hasProjectAccess(workspaceId, projectId, viewer);
  if (!allowed) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this project.");
  }
}

export async function assertTaskAccess(
  workspaceId: string,
  taskId: string,
  viewer: WorkspaceViewer
): Promise<{ projectId: string }> {
  const task = await prisma.ttTask.findFirst({
    where: { id: taskId, workspaceId },
    select: { projectId: true }
  });
  if (!task) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }

  await assertProjectAccess(workspaceId, task.projectId, viewer);
  return { projectId: task.projectId };
}

export async function assertScheduleEventAccess(
  workspaceId: string,
  eventId: string,
  viewer: WorkspaceViewer
): Promise<void> {
  const accessible = await getAccessibleProjectIds(workspaceId, viewer.staffMemberId, viewer.permissionRole);
  if (accessible === null) return;

  const event = await prisma.ttScheduleEvent.findFirst({
    where: { id: eventId, workspaceId },
    include: { guests: { select: { staffMemberId: true } } }
  });
  if (!event) {
    throw new AppError(404, "SCHEDULE_NOT_FOUND", "Schedule event not found.");
  }

  if (event.projectId && accessible.has(event.projectId)) return;
  if (event.guests.some((guest) => guest.staffMemberId === viewer.staffMemberId)) return;

  throw new AppError(403, "FORBIDDEN", "You do not have access to this schedule event.");
}

export async function assertTrashAccess(
  workspaceId: string,
  trashId: string,
  viewer: WorkspaceViewer
): Promise<void> {
  const accessible = await getAccessibleProjectIds(workspaceId, viewer.staffMemberId, viewer.permissionRole);
  if (accessible === null) return;

  const entry = await prisma.ttDeletedTask.findFirst({
    where: { trashId, workspaceId },
    select: { payload: true }
  });
  if (!entry) {
    throw new AppError(404, "TRASH_NOT_FOUND", "Deleted task not found.");
  }

  const payload = entry.payload as Record<string, unknown>;
  const team = typeof payload.team === "string" ? payload.team : "";
  if (!team) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this deleted task.");
  }

  const project = await prisma.ttProject.findFirst({
    where: { workspaceId, name: team },
    select: { id: true }
  });
  if (!project || !accessible.has(project.id)) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this deleted task.");
  }
}

export async function ensureProjectMembers(projectId: string, staffMemberIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(staffMemberIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  for (const staffMemberId of uniqueIds) {
    await prisma.ttProjectMember.upsert({
      where: {
        projectId_staffMemberId: { projectId, staffMemberId }
      },
      create: { projectId, staffMemberId },
      update: {}
    });
  }
}

/** All staff member IDs on a project (members + leader). */
export async function getProjectMemberStaffIds(projectId: string): Promise<string[]> {
  const project = await prisma.ttProject.findUnique({
    where: { id: projectId },
    select: {
      leaderId: true,
      members: { select: { staffMemberId: true } }
    }
  });
  if (!project) return [];

  const ids = new Set(project.members.map((member) => member.staffMemberId));
  if (project.leaderId) ids.add(project.leaderId);
  return [...ids];
}

function uniqueRecipientIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function mergeScheduleRecipientIds(projectMemberIds: string[], guestIds: string[]): string[] {
  return uniqueRecipientIds([...projectMemberIds, ...guestIds]);
}

export async function resolveViewerFromUserId(
  workspaceId: string,
  userId: string
): Promise<WorkspaceViewer | null> {
  const staffMember = await prisma.ttStaffMember.findFirst({
    where: { workspaceId, userId },
    select: { id: true, permissionRole: true }
  });
  if (!staffMember) return null;

  return {
    staffMemberId: staffMember.id,
    permissionRole: PERMISSION_ROLE_FROM_DB[staffMember.permissionRole as TtPermissionRoleDb]
  };
}
