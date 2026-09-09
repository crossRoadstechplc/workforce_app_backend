import { prisma } from "../../database/prisma.js";
import { PERMISSION_ROLE_FROM_DB, TASK_STATUS_FROM_DB, type TtPermissionRoleDb, type TtTaskStatusDb } from "./roles.js";
import type { LegacyTask, ScheduleEvent } from "./types.js";

export function mapTaskRow(
  task: {
    id: string;
    title: string;
    description: string;
    priority: string;
    due: string;
    status: TtTaskStatusDb | string;
    project: { name: string };
    owners: Array<{ staffMemberId: string; sortOrder: number }>;
    updates: Array<{ id: string; text: string; createdAt: Date }>;
  },
  idToDisplayName: Map<string, string>
): LegacyTask {
  const owners = [...task.owners]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((owner) => idToDisplayName.get(owner.staffMemberId) ?? "")
    .filter(Boolean);

  return {
    id: task.id,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    team: task.project.name,
    owner: owners[0] ?? "",
    owners,
    priority: task.priority,
    due: task.due,
    status: TASK_STATUS_FROM_DB[task.status as TtTaskStatusDb],
    updates: task.updates.map((update) => ({
      id: update.id,
      text: update.text,
      createdAt: update.createdAt.toISOString()
    }))
  };
}

export function mapScheduleRow(
  event: {
    id: string;
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
    description: string;
    location: string;
    color: string;
    project: { name: string } | null;
    guests: { staffMember: { displayName: string } }[];
  },
  staffNames: Set<string>
): ScheduleEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    description: event.description,
    location: event.location,
    project: event.project?.name ?? "",
    color: event.color,
    guests: event.guests.map((g) => g.staffMember.displayName).filter((name) => staffNames.has(name))
  };
}

export async function loadTaskLegacy(taskId: string, workspaceId: string): Promise<LegacyTask | null> {
  const task = await prisma.ttTask.findFirst({
    where: { id: taskId, workspaceId },
    include: {
      project: true,
      owners: { orderBy: { sortOrder: "asc" } },
      updates: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!task) return null;

  const members = await prisma.ttStaffMember.findMany({
    where: { workspaceId },
    select: { id: true, displayName: true }
  });
  const idToDisplayName = new Map(members.map((m) => [m.id, m.displayName]));
  return mapTaskRow(task, idToDisplayName);
}

export async function loadScheduleLegacy(eventId: string, workspaceId: string): Promise<ScheduleEvent | null> {
  const event = await prisma.ttScheduleEvent.findFirst({
    where: { id: eventId, workspaceId },
    include: {
      project: true,
      guests: { include: { staffMember: true } }
    }
  });
  if (!event) return null;

  const staff = await prisma.ttStaffMember.findMany({
    where: { workspaceId },
    select: { displayName: true }
  });
  return mapScheduleRow(event, new Set(staff.map((s) => s.displayName)));
}

export function mapStaffMemberResponse(member: {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  permissionRole: TtPermissionRoleDb | string;
  user?: { email: string; mustChangePassword: boolean } | null;
}) {
  return {
    id: member.id,
    displayName: member.displayName,
    firstName: member.firstName,
    lastName: member.lastName,
    jobTitle: member.jobTitle,
    permissionRole: PERMISSION_ROLE_FROM_DB[member.permissionRole as TtPermissionRoleDb],
    ...(member.user?.email ? { email: member.user.email } : {}),
    inviteStatus: member.user?.mustChangePassword ? ("pending" as const) : ("active" as const)
  };
}
