import { prisma } from "../../database/prisma.js";
import { PERMISSION_ROLE_FROM_DB, PERMISSION_ROLE_LABELS, TASK_STATUS_FROM_DB, type TtPermissionRoleDb, type TtTaskStatusDb } from "./roles.js";
import { getAccessibleProjectIds, type WorkspaceViewer } from "./visibility.js";
import type {
  ArchivedTask,
  DeletedTask,
  LegacyTask,
  PermissionRoleLabel,
  ScheduleEvent,
  StaffProfile,
  WorkspaceData
} from "./types.js";

function buildStaffMaps(
  staffMembers: Array<{
    id: string;
    displayName: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    permissionRole: TtPermissionRoleDb | string;
    user?: { email: string; mustChangePassword: boolean } | null;
  }>
) {
  const staff: string[] = [];
  const staffProfiles: Record<string, StaffProfile> = {};
  const idToDisplayName = new Map<string, string>();

  for (const member of staffMembers) {
    staff.push(member.displayName);
    idToDisplayName.set(member.id, member.displayName);
    const invitePending = Boolean(member.user?.mustChangePassword);
    staffProfiles[member.displayName] = {
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.jobTitle,
      permissionRole: PERMISSION_ROLE_FROM_DB[member.permissionRole as TtPermissionRoleDb],
      ...(member.user?.email ? { email: member.user.email } : {}),
      inviteStatus: invitePending ? "pending" : "active"
    };
  }

  return { staff, staffProfiles, idToDisplayName };
}

function mapTask(
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
    updates: [...task.updates]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((update) => ({
        id: update.id,
        text: update.text,
        createdAt: update.createdAt.toISOString()
      }))
  };
}

async function loadWorkspace(workspaceId: string) {
  return prisma.ttWorkspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: {
      staffMembers: {
        orderBy: { sortOrder: "asc" },
        include: {
          user: {
            select: {
              email: true,
              mustChangePassword: true
            }
          }
        }
      },
      projects: {
        orderBy: { sortOrder: "asc" },
        include: {
          members: { include: { staffMember: true } },
          leader: true
        }
      },
      orgTeams: {
        orderBy: { sortOrder: "asc" },
        include: {
          members: { include: { staffMember: true } }
        }
      },
      tasks: {
        orderBy: { sortOrder: "asc" },
        include: {
          project: true,
          owners: { orderBy: { sortOrder: "asc" } },
          updates: { orderBy: { createdAt: "desc" } }
        }
      },
      deletedTasks: { orderBy: { deletedAt: "desc" } },
      archivedTasks: { orderBy: { archivedAt: "desc" } },
      scheduleEvents: {
        orderBy: { start: "asc" },
        include: {
          project: true,
          guests: { include: { staffMember: true } }
        }
      },
      permissionRules: true
    }
  });
}

export async function getLegacyWorkspaceData(
  workspaceId: string,
  viewer?: WorkspaceViewer
): Promise<WorkspaceData> {
  const workspace = await loadWorkspace(workspaceId);
  const accessibleProjectIds = viewer
    ? await getAccessibleProjectIds(workspaceId, viewer.staffMemberId, viewer.permissionRole)
    : null;

  const visibleProjects =
    accessibleProjectIds === null
      ? workspace.projects
      : workspace.projects.filter((project) => accessibleProjectIds.has(project.id));

  const visibleProjectNames = new Set(visibleProjects.map((project) => project.name));

  const visibleTasks =
    accessibleProjectIds === null
      ? workspace.tasks
      : workspace.tasks.filter((task) => accessibleProjectIds.has(task.projectId));

  const visibleDeletedTasks =
    accessibleProjectIds === null
      ? workspace.deletedTasks
      : workspace.deletedTasks.filter((entry) => {
          const payload = entry.payload as Record<string, unknown>;
          const team = typeof payload.team === "string" ? payload.team : "";
          return team && visibleProjectNames.has(team);
        });

  const visibleArchivedTasks =
    accessibleProjectIds === null
      ? workspace.archivedTasks
      : workspace.archivedTasks.filter((entry) => {
          const payload = entry.payload as Record<string, unknown>;
          const team = typeof payload.team === "string" ? payload.team : "";
          return team && visibleProjectNames.has(team);
        });

  const visibleScheduleEvents =
    accessibleProjectIds === null
      ? workspace.scheduleEvents
      : workspace.scheduleEvents.filter((event) => {
          if (event.guests.some((guest) => guest.staffMemberId === viewer!.staffMemberId)) {
            return true;
          }
          if (event.projectId && accessibleProjectIds.has(event.projectId)) return true;
          return false;
        });

  const { staff, staffProfiles, idToDisplayName } = buildStaffMaps(workspace.staffMembers);
  const staffIds: Record<string, string> = {};
  for (const member of workspace.staffMembers) {
    staffIds[member.displayName] = member.id;
  }

  const teams = visibleProjects.map((project) => project.name);
  const projectIds: Record<string, string> = {};
  const teamMembers: Record<string, string[]> = {};
  const teamLeaders: Record<string, string> = {};

  for (const project of visibleProjects) {
    projectIds[project.name] = project.id;
    teamMembers[project.name] = project.members
      .map((member) => member.staffMember.displayName)
      .filter((name) => staff.includes(name));
    teamLeaders[project.name] = project.leader?.displayName ?? "";
  }

  const orgTeams = workspace.orgTeams.map((team) => team.name);
  const orgTeamIds: Record<string, string> = {};
  const orgTeamMembers: Record<string, string[]> = {};

  for (const orgTeam of workspace.orgTeams) {
    orgTeamIds[orgTeam.name] = orgTeam.id;
    orgTeamMembers[orgTeam.name] = orgTeam.members
      .map((member) => member.staffMember.displayName)
      .filter((name) => staff.includes(name));
  }

  const tasks = visibleTasks.map((task) => mapTask(task, idToDisplayName));

  const deletedTasks = visibleDeletedTasks.map((entry) => {
    const payload = entry.payload as Record<string, unknown>;
    return {
      ...(payload as DeletedTask),
      trashId: entry.trashId,
      previousStatus: entry.previousStatus,
      deletedAt: entry.deletedAt.toISOString()
    };
  });

  const archivedTasks = visibleArchivedTasks.map((entry) => {
    const payload = entry.payload as Record<string, unknown>;
    return {
      ...(payload as ArchivedTask),
      archivedId: entry.archivedId,
      archivedAt: entry.archivedAt.toISOString()
    };
  });

  const events: ScheduleEvent[] = visibleScheduleEvents
    .filter((event) => event.start && event.end)
    .map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
      description: event.description,
      location: event.location,
      project: event.project?.name ?? "",
      color: event.color,
      guests: event.guests.map((guest) => guest.staffMember.displayName).filter((name) => staff.includes(name))
    }));

  const permissionMatrix = PERMISSION_ROLE_LABELS.reduce(
    (matrix, roleLabel) => {
      matrix[roleLabel] = {};
      return matrix;
    },
    {} as Record<PermissionRoleLabel, Record<string, boolean>>
  );

  for (const rule of workspace.permissionRules) {
    const roleLabel = PERMISSION_ROLE_FROM_DB[rule.role as TtPermissionRoleDb];
    permissionMatrix[roleLabel][rule.actionId] = rule.allowed;
  }

  return {
    tasks,
    teams,
    deletedTasks,
    archivedTasks,
    staff,
    staffProfiles,
    teamMembers,
    teamLeaders,
    orgTeams,
    orgTeamMembers,
    schedule: { events },
    permissionMatrix,
    projectIds,
    orgTeamIds,
    staffIds
  };
}
