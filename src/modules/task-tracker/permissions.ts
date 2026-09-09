import type {
  LegacyTask,
  PermissionRoleLabel,
  ScheduleEvent,
  StaffProfile,
  WorkspaceData
} from "./types.js";

export const PERMISSION_ROLES: PermissionRoleLabel[] = [
  "Super Admin",
  "Admin",
  "Lead",
  "Senior Staff",
  "Junior Staff"
];

export type PermissionActionId =
  | "tasks.create"
  | "tasks.edit"
  | "tasks.move"
  | "tasks.delete"
  | "tasks.addUpdate"
  | "trash.restore"
  | "projects.create"
  | "projects.rename"
  | "projects.delete"
  | "projects.manageMembers"
  | "teams.create"
  | "teams.rename"
  | "teams.delete"
  | "teams.manageMembers"
  | "staff.create"
  | "staff.edit"
  | "staff.delete"
  | "staff.assignRole"
  | "schedule.create"
  | "schedule.edit"
  | "schedule.delete"
  | "backup.export"
  | "backup.import"
  | "settings.editPermissions";

export function can(
  role: PermissionRoleLabel,
  actionId: string,
  matrix: WorkspaceData["permissionMatrix"]
): boolean {
  if (role === "Super Admin") return true;
  return Boolean(matrix[role]?.[actionId]);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function staffHasSuperAdmin(staff: string[], profiles: Record<string, StaffProfile>): boolean {
  return staff.some((name) => profiles[name]?.permissionRole === "Super Admin");
}

function mergeNamedCollection(input: {
  existingNames: string[];
  incomingNames: string[];
  existingMembers: Record<string, string[]>;
  incomingMembers: Record<string, string[]>;
  existingLeaders?: Record<string, string>;
  incomingLeaders?: Record<string, string>;
  canCreate: boolean;
  canRename: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
}): {
  names: string[];
  members: Record<string, string[]>;
  leaders: Record<string, string>;
} {
  const canChangeNames = input.canCreate || input.canRename || input.canDelete;
  const names = canChangeNames ? [...input.incomingNames] : [...input.existingNames];
  const members: Record<string, string[]> = {};
  const leaders: Record<string, string> = {};

  for (const name of names) {
    if (input.canManageMembers) {
      members[name] = [...(input.incomingMembers[name] ?? [])];
      leaders[name] = input.incomingLeaders?.[name] ?? "";
    } else {
      members[name] = [...(input.existingMembers[name] ?? [])];
      leaders[name] = input.existingLeaders?.[name] ?? "";
    }
  }

  return { names, members, leaders };
}

function mergeStaff(input: {
  existing: WorkspaceData;
  incoming: WorkspaceData;
  allowed: (action: PermissionActionId) => boolean;
  actorDisplayName: string;
}): Pick<WorkspaceData, "staff" | "staffProfiles"> {
  const existingProfiles = clone(input.existing.staffProfiles);
  let staff = [...input.existing.staff];

  if (input.allowed("staff.create")) {
    for (const name of input.incoming.staff) {
      if (!staff.includes(name)) staff.push(name);
    }
  }

  if (input.allowed("staff.delete")) {
    staff = staff.filter((name) => input.incoming.staff.includes(name) || name === input.actorDisplayName);
  }

  const staffProfiles: Record<string, StaffProfile> = {};

  for (const name of staff) {
    const incomingProfile = input.incoming.staffProfiles[name];
    const existingProfile = existingProfiles[name];

    if (!existingProfile && incomingProfile) {
      staffProfiles[name] = { ...incomingProfile };
      continue;
    }

    const next: StaffProfile = {
      firstName: existingProfile?.firstName ?? name,
      lastName: existingProfile?.lastName ?? "",
      role: existingProfile?.role ?? "",
      permissionRole: existingProfile?.permissionRole ?? "Junior Staff",
      ...(existingProfile?.email ? { email: existingProfile.email } : {}),
      ...(existingProfile?.inviteStatus ? { inviteStatus: existingProfile.inviteStatus } : {})
    };

    if (incomingProfile && input.allowed("staff.edit")) {
      next.firstName = incomingProfile.firstName;
      next.lastName = incomingProfile.lastName;
      next.role = incomingProfile.role;
    }

    if (incomingProfile && input.allowed("staff.assignRole")) {
      next.permissionRole = incomingProfile.permissionRole;
    }

    staffProfiles[name] = next;
  }

  if (!staffHasSuperAdmin(staff, staffProfiles)) {
    for (const name of input.existing.staff) {
      if (input.existing.staffProfiles[name]?.permissionRole !== "Super Admin") continue;
      if (!staff.includes(name)) staff.unshift(name);
      staffProfiles[name] = clone(input.existing.staffProfiles[name]!);
    }
  }

  return { staff, staffProfiles };
}

function mergeTasks(input: {
  existing: LegacyTask[];
  incoming: LegacyTask[];
  allowed: (action: PermissionActionId) => boolean;
}): LegacyTask[] {
  const existingById = new Map(input.existing.map((task) => [task.id, task]));
  const incomingIds = new Set(input.incoming.map((task) => task.id));
  const result: LegacyTask[] = [];

  for (const task of input.incoming) {
    const previous = existingById.get(task.id);
    if (!previous) {
      if (input.allowed("tasks.create")) result.push(clone(task));
      continue;
    }

    const merged: LegacyTask = clone(previous);
    if (input.allowed("tasks.edit")) {
      merged.title = task.title;
      merged.description = task.description;
      merged.team = task.team;
      merged.owner = task.owner;
      merged.owners = [...(task.owners ?? [])];
      merged.priority = task.priority;
      merged.due = task.due;
    }
    if (input.allowed("tasks.move")) {
      merged.status = task.status;
    }
    if (input.allowed("tasks.addUpdate")) {
      merged.updates = clone(task.updates ?? []);
    }
    result.push(merged);
  }

  for (const task of input.existing) {
    if (incomingIds.has(task.id)) continue;
    if (input.allowed("tasks.delete")) continue;
    result.push(clone(task));
  }

  return result;
}

function mergeById<T>(
  existing: T[],
  incoming: T[],
  getId: (item: T) => string,
  canAdd: boolean,
  canRemove: boolean
): T[] {
  if (canAdd && canRemove) return clone(incoming);

  const existingIds = new Set(existing.map(getId));
  const incomingIds = new Set(incoming.map(getId));
  let result = clone(existing);

  if (canAdd) {
    for (const item of incoming) {
      if (!existingIds.has(getId(item))) result.push(clone(item));
    }
  }

  if (canRemove) {
    result = result.filter((item) => incomingIds.has(getId(item)));
  }

  return result;
}

function mergeSchedule(
  existing: ScheduleEvent[],
  incoming: ScheduleEvent[],
  allowed: (action: PermissionActionId) => boolean
): ScheduleEvent[] {
  const existingById = new Map(existing.map((event) => [event.id, event]));
  const incomingIds = new Set(incoming.map((event) => event.id));
  const result: ScheduleEvent[] = [];

  for (const event of incoming) {
    const previous = existingById.get(event.id);
    if (!previous) {
      if (allowed("schedule.create")) result.push(clone(event));
      continue;
    }
    result.push(clone(allowed("schedule.edit") ? event : previous));
  }

  for (const event of existing) {
    if (incomingIds.has(event.id)) continue;
    if (allowed("schedule.delete")) continue;
    result.push(clone(event));
  }

  return result;
}

export function applyPermittedWorkspaceUpdate(input: {
  existing: WorkspaceData;
  incoming: WorkspaceData;
  role: PermissionRoleLabel;
  actorDisplayName: string;
}): WorkspaceData {
  const { existing, incoming, role, actorDisplayName } = input;
  const allowed = (action: PermissionActionId) => can(role, action, existing.permissionMatrix);

  if (role === "Super Admin" || allowed("backup.import")) {
    const next = clone(incoming);
    if (!staffHasSuperAdmin(next.staff, next.staffProfiles)) {
      next.staff = clone(existing.staff);
      next.staffProfiles = clone(existing.staffProfiles);
    }
    if (!next.staff.includes(actorDisplayName) && existing.staff.includes(actorDisplayName)) {
      next.staff = [...next.staff, actorDisplayName];
      next.staffProfiles[actorDisplayName] = clone(existing.staffProfiles[actorDisplayName]!);
    }
    next.permissionMatrix = allowed("settings.editPermissions")
      ? clone(incoming.permissionMatrix)
      : clone(existing.permissionMatrix);
    return next;
  }

  const staff = mergeStaff({ existing, incoming, allowed, actorDisplayName });
  const projects = mergeNamedCollection({
    existingNames: existing.teams,
    incomingNames: incoming.teams,
    existingMembers: existing.teamMembers,
    incomingMembers: incoming.teamMembers,
    existingLeaders: existing.teamLeaders,
    incomingLeaders: incoming.teamLeaders,
    canCreate: allowed("projects.create"),
    canRename: allowed("projects.rename"),
    canDelete: allowed("projects.delete"),
    canManageMembers: allowed("projects.manageMembers")
  });
  const orgTeams = mergeNamedCollection({
    existingNames: existing.orgTeams,
    incomingNames: incoming.orgTeams,
    existingMembers: existing.orgTeamMembers,
    incomingMembers: incoming.orgTeamMembers,
    canCreate: allowed("teams.create"),
    canRename: allowed("teams.rename"),
    canDelete: allowed("teams.delete"),
    canManageMembers: allowed("teams.manageMembers")
  });

  return {
    tasks: mergeTasks({
      existing: existing.tasks,
      incoming: incoming.tasks,
      allowed
    }),
    teams: projects.names,
    deletedTasks: mergeById(
      existing.deletedTasks,
      incoming.deletedTasks,
      (item) => item.trashId ?? item.id,
      allowed("tasks.delete"),
      allowed("trash.restore")
    ),
    archivedTasks: mergeById(
      existing.archivedTasks,
      incoming.archivedTasks,
      (item) => item.archivedId,
      allowed("tasks.delete"),
      allowed("tasks.delete")
    ),
    staff: staff.staff,
    staffProfiles: staff.staffProfiles,
    teamMembers: projects.members,
    teamLeaders: projects.leaders,
    orgTeams: orgTeams.names,
    orgTeamMembers: orgTeams.members,
    schedule: {
      events: mergeSchedule(existing.schedule?.events ?? [], incoming.schedule?.events ?? [], allowed)
    },
    permissionMatrix: allowed("settings.editPermissions")
      ? clone(incoming.permissionMatrix)
      : clone(existing.permissionMatrix)
  };
}
