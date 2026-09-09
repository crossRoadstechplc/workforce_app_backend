import { isOfficeAdmin, isOrgAdmin, ROLE, type AuthContext } from "../../shared/tenancy.js";
import type { TtPermissionRoleDb } from "./roles.js";

export function defaultPermissionRoleForAuth(
  auth: AuthContext,
  opts?: { enabler?: boolean }
): TtPermissionRoleDb {
  if (opts?.enabler) return "SUPER_ADMIN";
  if (isOrgAdmin(auth) || auth.roles.includes(ROLE.ORG_ADMIN) || auth.roles.includes("ADMIN")) {
    return "ADMIN";
  }
  if (isOfficeAdmin(auth)) return "LEAD";
  return "JUNIOR_STAFF";
}
