import { prisma } from "../../database/prisma.js";
import { DEFAULT_PERMISSION_MATRIX } from "./default-matrix.js";
import { PERMISSION_ROLE_TO_DB, type TtPermissionRoleDb } from "./roles.js";
import { syncWorkforceStaffToWorkspace } from "./staff-sync.service.js";
import type { PermissionRoleLabel } from "./types.js";

function seedPermissionRows(workspaceId: string) {
  const rows: Array<{
    workspaceId: string;
    role: TtPermissionRoleDb;
    actionId: string;
    allowed: boolean;
  }> = [];

  for (const [roleLabel, actions] of Object.entries(DEFAULT_PERMISSION_MATRIX)) {
    const role = PERMISSION_ROLE_TO_DB[roleLabel as PermissionRoleLabel];
    for (const [actionId, allowed] of Object.entries(actions)) {
      rows.push({ workspaceId, role, actionId, allowed: Boolean(allowed) });
    }
  }
  return rows;
}

/**
 * Task Operations is always available per organization.
 * Creates the workspace + permission matrix on first use, then syncs Workforce people.
 */
export async function ensureTtWorkspace(organizationId: string) {
  const existing = await prisma.ttWorkspace.findUnique({ where: { organizationId } });
  if (existing) return existing;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const workspace = await tx.ttWorkspace.create({
        data: {
          organizationId,
          name: "Task Operations"
        }
      });
      const permissionRows = seedPermissionRows(workspace.id);
      if (permissionRows.length) {
        await tx.ttPermissionRule.createMany({ data: permissionRows });
      }
      return workspace;
    });

    await syncWorkforceStaffToWorkspace({
      workspaceId: created.id,
      organizationId
    });

    console.log("[tt-workspace] auto-enabled", { organizationId, workspaceId: created.id });
    return created;
  } catch (err) {
    // Concurrent first-access race: unique(organization_id) won elsewhere.
    const raced = await prisma.ttWorkspace.findUnique({ where: { organizationId } });
    if (raced) return raced;
    throw err;
  }
}
