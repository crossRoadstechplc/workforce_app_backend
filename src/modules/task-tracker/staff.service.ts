import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { publishWorkspaceEvent } from "./events/notify.js";
import { PERMISSION_ROLE_TO_DB, toPermissionRoleLabel } from "./roles.js";
import { mapStaffMemberResponse } from "./serialize.js";
import type { ActorContext, PermissionRoleLabel } from "./types.js";

export async function updateStaffMember(input: {
  actor: ActorContext;
  staffId: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  displayName?: string;
}) {
  const workspaceId = input.actor.workspaceId;
  const member = await prisma.ttStaffMember.findFirst({
    where: { id: input.staffId, workspaceId },
    include: { user: { select: { email: true, mustChangePassword: true } } }
  });
  if (!member) throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found.");

  const firstName = input.firstName ?? member.firstName;
  const lastName = input.lastName ?? member.lastName;
  const displayName =
    input.displayName ?? ([firstName, lastName].filter(Boolean).join(" ").trim() || member.displayName);

  const updated = await prisma.ttStaffMember.update({
    where: { id: input.staffId },
    data: {
      firstName,
      lastName,
      displayName,
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {})
    },
    include: { user: { select: { email: true, mustChangePassword: true } } }
  });

  const published = await publishWorkspaceEvent({
    type: "staff.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: updated.id,
    payload: mapStaffMemberResponse(updated)
  });

  return { staffMember: mapStaffMemberResponse(updated), revision: published.revision };
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

export async function deleteStaffMember(input: { actor: ActorContext; staffId: string }) {
  const workspaceId = input.actor.workspaceId;
  const member = await prisma.ttStaffMember.findFirst({
    where: { id: input.staffId, workspaceId }
  });
  if (!member) throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found.");
  if (member.id === input.actor.staffMemberId) {
    throw new AppError(400, "CANNOT_REMOVE_SELF", "You cannot remove yourself.");
  }

  await prisma.ttStaffMember.delete({ where: { id: input.staffId } });

  const published = await publishWorkspaceEvent({
    type: "staff.deleted",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: input.staffId,
    payload: { id: input.staffId, displayName: member.displayName }
  });

  return { revision: published.revision };
}

export async function createStaffFromUser(input: {
  actor: ActorContext;
  email: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  permissionRole?: string;
}) {
  const workspaceId = input.actor.workspaceId;
  const email = input.email.trim().toLowerCase();
  const workspace = await prisma.ttWorkspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { organizationId: true }
  });

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      employee: true,
      memberships: { where: { organizationId: workspace.organizationId } }
    }
  });
  if (!user || user.memberships.length === 0) {
    throw new AppError(404, "USER_NOT_FOUND", "No organization user found with that email.");
  }

  const existing = await prisma.ttStaffMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } }
  });
  if (existing) throw new AppError(409, "STAFF_EXISTS", "Staff member already exists.");

  const firstName = input.firstName.trim() || user.employee?.firstName || email.split("@")[0]!;
  const lastName = input.lastName?.trim() ?? user.employee?.lastName ?? "";
  let displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || email;
  const clash = await prisma.ttStaffMember.findUnique({
    where: { workspaceId_displayName: { workspaceId, displayName } }
  });
  if (clash) displayName = `${displayName} (${email.split("@")[0]})`;

  const maxSort = await prisma.ttStaffMember.aggregate({
    where: { workspaceId },
    _max: { sortOrder: true }
  });

  const created = await prisma.ttStaffMember.create({
    data: {
      workspaceId,
      userId: user.id,
      employeeId: user.employee?.id ?? null,
      displayName,
      firstName,
      lastName,
      jobTitle: input.jobTitle ?? user.employee?.jobTitle ?? "",
      permissionRole: PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(input.permissionRole ?? "Junior Staff")],
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1
    },
    include: { user: { select: { email: true, mustChangePassword: true } } }
  });

  const staffMember = mapStaffMemberResponse(created);
  const published = await publishWorkspaceEvent({
    type: "staff.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "staff",
    resourceId: created.id,
    payload: staffMember
  });

  return {
    email,
    acceptUrl: "",
    message: "Staff member linked from existing workforce user.",
    emailSent: false,
    emailError: "Invites are managed by workforce; staff was linked to an existing user.",
    inviteTtlHours: 0,
    loginUrl: "",
    staffMember: { ...staffMember, inviteStatus: "active" as const },
    revision: published.revision
  };
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
