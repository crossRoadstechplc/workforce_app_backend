import type { PermissionRoleLabel } from "./types.js";

export function canSeeAllProjects(role: PermissionRoleLabel): boolean {
  return role === "Super Admin" || role === "Admin";
}

/** Admins see every task; same bypass as projects. */
export function canSeeAllTasks(role: PermissionRoleLabel): boolean {
  return canSeeAllProjects(role);
}

/**
 * Task row visibility:
 * - Admin / Super Admin → all
 * - Listed on TtTaskOwner → yes
 * - No owners (unassigned) → project leader only
 * - Otherwise → no (project membership alone is not enough)
 */
export function isTaskVisibleToViewer(input: {
  viewerStaffMemberId: string;
  viewerRole: PermissionRoleLabel;
  ownerStaffMemberIds: string[];
  projectLeaderId: string | null | undefined;
}): boolean {
  if (canSeeAllTasks(input.viewerRole)) return true;
  if (input.ownerStaffMemberIds.includes(input.viewerStaffMemberId)) return true;
  if (
    input.ownerStaffMemberIds.length === 0 &&
    input.projectLeaderId &&
    input.projectLeaderId === input.viewerStaffMemberId
  ) {
    return true;
  }
  return false;
}

/** Staff IDs that should receive a live task event (admins still get all via canSeeAll). */
export function taskEventRecipientStaffIds(
  ownerStaffMemberIds: string[],
  projectLeaderId: string | null | undefined
): string[] {
  if (ownerStaffMemberIds.length > 0) {
    return [...new Set(ownerStaffMemberIds.filter(Boolean))];
  }
  return projectLeaderId ? [projectLeaderId] : [];
}
