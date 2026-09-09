import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { AuthContext } from "../../shared/tenancy.js";
import { requireWorkspaceByOrganizationId } from "./context.js";
import { defaultPermissionRoleForAuth } from "./role-defaults.js";
import { PERMISSION_ROLE_FROM_DB, type TtPermissionRoleDb } from "./roles.js";
import type { TrackerContext } from "./types.js";

export { defaultPermissionRoleForAuth } from "./role-defaults.js";

function buildDisplayName(firstName: string, lastName: string, fallback: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

async function uniqueDisplayName(workspaceId: string, base: string, userId: string) {
  const existing = await prisma.ttStaffMember.findUnique({
    where: { workspaceId_displayName: { workspaceId, displayName: base } },
    select: { userId: true }
  });
  if (!existing || existing.userId === userId) return base;
  const email = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const suffix = email?.email?.split("@")[0] ?? userId.slice(0, 8);
  return `${base} (${suffix})`;
}

export async function ensureMembership(input: {
  workspaceId: string;
  auth: AuthContext;
  enabler?: boolean;
}): Promise<TrackerContext> {
  const existing = await prisma.ttStaffMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: input.workspaceId, userId: input.auth.userId }
    }
  });
  if (existing) {
    return {
      workspaceId: input.workspaceId,
      staffMemberId: existing.id,
      permissionRole: PERMISSION_ROLE_FROM_DB[existing.permissionRole as TtPermissionRoleDb],
      displayName: existing.displayName
    };
  }

  const employee = await prisma.employee.findFirst({
    where: {
      userId: input.auth.userId,
      organizationId: input.auth.organizationId ?? undefined
    }
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.auth.userId },
    select: { email: true }
  });

  const firstName = employee?.firstName ?? user.email.split("@")[0] ?? "User";
  const lastName = employee?.lastName ?? "";
  const baseName = buildDisplayName(firstName, lastName, user.email);
  const displayName = await uniqueDisplayName(input.workspaceId, baseName, input.auth.userId);
  const permissionRole = defaultPermissionRoleForAuth(input.auth, { enabler: input.enabler });

  const maxSort = await prisma.ttStaffMember.aggregate({
    where: { workspaceId: input.workspaceId },
    _max: { sortOrder: true }
  });

  const created = await prisma.ttStaffMember.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.auth.userId,
      employeeId: employee?.id ?? null,
      displayName,
      firstName,
      lastName,
      jobTitle: employee?.jobTitle ?? "",
      permissionRole,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1
    }
  });

  return {
    workspaceId: input.workspaceId,
    staffMemberId: created.id,
    permissionRole: PERMISSION_ROLE_FROM_DB[created.permissionRole as TtPermissionRoleDb],
    displayName: created.displayName
  };
}

export async function resolveTrackerContext(auth: AuthContext): Promise<TrackerContext> {
  if (!auth.organizationId) {
    throw new AppError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required");
  }
  const workspace = await requireWorkspaceByOrganizationId(auth.organizationId);
  return ensureMembership({ workspaceId: workspace.id, auth });
}
