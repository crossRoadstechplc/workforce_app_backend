import { AppError } from "../shared/errors/app-error.js";

export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  OFFICE_ADMIN: "OFFICE_ADMIN",
  EMPLOYEE: "EMPLOYEE"
} as const;

export type AuthContext = {
  userId: string;
  roles: string[];
  permissions: string[];
  restricted: boolean;
  organizationId: string | null;
  officeIds?: string[];
};

export function isSuperAdmin(auth?: AuthContext | null) {
  return !!auth?.roles.includes(ROLE.SUPER_ADMIN);
}

export function isOrgAdmin(auth?: AuthContext | null) {
  return !!auth?.roles.some((r) => r === ROLE.ORG_ADMIN || r === "ADMIN");
}

export function isOfficeAdmin(auth?: AuthContext | null) {
  return !!auth?.roles.includes(ROLE.OFFICE_ADMIN);
}

export function isTenantAdmin(auth?: AuthContext | null) {
  return isOrgAdmin(auth) || isOfficeAdmin(auth);
}

export function requireOrganizationId(auth?: AuthContext | null): string {
  if (!auth?.organizationId) throw new AppError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required");
  return auth.organizationId;
}

export function assertSameOrganization(entityOrgId: string | null | undefined, organizationId: string, notFoundCode = "NOT_FOUND", message = "Resource not found") {
  if (!entityOrgId || entityOrgId !== organizationId) throw new AppError(404, notFoundCode, message);
}
