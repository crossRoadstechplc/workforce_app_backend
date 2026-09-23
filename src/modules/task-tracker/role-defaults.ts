import type { AuthContext } from "../../shared/tenancy.js";
import { isOfficeAdmin, isOrgAdmin, ROLE } from "../../shared/tenancy.js";
import type { TtPermissionRoleDb } from "./roles.js";

/**
 * Defaults for NEW tracker staff rows only.
 * Existing permissionRole is never overwritten by sync.
 *
 * Workforce org admins can administer Task Operations (Super Admin).
 * Office admins default to Lead. Employees default to Junior Staff.
 */
export function defaultPermissionRoleForAuth(
  auth: AuthContext,
  opts?: { enabler?: boolean }
): TtPermissionRoleDb {
  if (opts?.enabler) return "SUPER_ADMIN";
  if (isOrgAdmin(auth) || auth.roles.includes(ROLE.ORG_ADMIN) || auth.roles.includes("ADMIN")) {
    return "SUPER_ADMIN";
  }
  if (isOfficeAdmin(auth) || auth.roles.includes(ROLE.OFFICE_ADMIN)) {
    return "LEAD";
  }
  return "JUNIOR_STAFF";
}
