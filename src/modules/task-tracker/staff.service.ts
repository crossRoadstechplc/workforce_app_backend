import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { publishWorkspaceEvent } from "./events/notify.js";
import { PERMISSION_ROLE_TO_DB, toPermissionRoleLabel } from "./roles.js";
import { mapStaffMemberResponse } from "./serialize.js";
import type { ActorContext, PermissionRoleLabel } from "./types.js";

export async function updateStaffMember(_input: {
  actor: ActorContext;
  staffId: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  displayName?: string;
}): Promise<never> {
  throw new AppError(
    400,
    "STAFF_PROFILE_READ_ONLY",
    "Name, job title, department, and office come from Workforce. Change tracker access with Permission Role only."
  );
}

export async function updateStaffRole(input: {
  actor: ActorContext;
  staffId: string;
  permissionRole: PermissionRoleLabel;
}) {
  const workspaceId = input.actor.workspaceId;
  const member = await prisma.ttStaffMember.findFirst({
    where: { id: input.staffId, workspaceId },
    include: { user: { select: { email: true, mustChangePassword: true } } }
  });
  if (!member) throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found.");

  const updated = await prisma.ttStaffMember.update({
    where: { id: input.staffId },
    data: {
      permissionRole: PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(input.permissionRole)]
    },
    include: { user: { select: { email: true, mustChangePassword: true } } }
  });

  const published = await publishWorkspaceEvent({
    type: "staff.role.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: updated.id,
    payload: mapStaffMemberResponse(updated)
  });

  return { staffMember: mapStaffMemberResponse(updated), revision: published.revision };
}

export async function deleteStaffMember(_input: { actor: ActorContext; staffId: string }): Promise<never> {
  throw new AppError(
    400,
    "STAFF_MANAGED_BY_WORKFORCE",
    "Team members come from Workforce. Deactivate or manage people in the admin portal — they cannot be removed from Task Operations."
  );
}

export async function createStaffFromUser(_input: {
  actor: ActorContext;
  email: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  permissionRole?: string;
}): Promise<never> {
  throw new AppError(
    410,
    "TRACKER_INVITE_RETIRED",
    "Inviting from Task Operations is disabled. Add people in Workforce; they appear here automatically with Junior Staff permission until you change their tracker role."
  );
}

export async function updatePermissions(input: {
  actor: ActorContext;
  matrix: Record<string, Record<string, boolean>>;
}) {
  const workspaceId = input.actor.workspaceId;

  const rows: Array<{
    workspaceId: string;
    role: (typeof PERMISSION_ROLE_TO_DB)[keyof typeof PERMISSION_ROLE_TO_DB];
    actionId: string;
    allowed: boolean;
  }> = [];

  for (const [roleLabel, actions] of Object.entries(input.matrix)) {
    const role = PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(roleLabel)];
    for (const [actionId, allowed] of Object.entries(actions)) {
      rows.push({
        workspaceId,
        role,
        actionId,
        allowed: Boolean(allowed)
      });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.ttPermissionRule.deleteMany({ where: { workspaceId } });
      if (rows.length > 0) {
        await tx.ttPermissionRule.createMany({ data: rows });
      }
    },
    { timeout: 15_000 }
  );

  const published = await publishWorkspaceEvent({
    type: "permissions.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "permissions",
    resourceId: null,
    payload: input.matrix
  });

  return { revision: published.revision };
}
