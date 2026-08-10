import { AppError } from "./errors/app-error.js";
import { isOrgAdmin, isOfficeAdmin, type AuthContext } from "./tenancy.js";

export type OfficeScope = {
  /** When true the user sees all offices in the organization. */
  allOffices: boolean;
  officeIds: string[];
};

export function getOfficeScope(auth?: AuthContext | null): OfficeScope {
  if (!auth) return { allOffices: false, officeIds: [] };
  if (isOrgAdmin(auth)) return { allOffices: true, officeIds: [] };
  if (isOfficeAdmin(auth)) return { allOffices: false, officeIds: auth.officeIds ?? [] };
  return { allOffices: true, officeIds: [] };
}

export function assertOfficeInScope(scope: OfficeScope, officeId: string | null | undefined, message = "You do not manage this office") {
  if (!officeId) {
    if (!scope.allOffices) throw new AppError(403, "OFFICE_SCOPE_REQUIRED", "An office assignment is required for this action");
    return;
  }
  if (!scope.allOffices && !scope.officeIds.includes(officeId)) {
    throw new AppError(403, "OFFICE_FORBIDDEN", message);
  }
}

/** Prisma filter on Employee.officeId */
export function employeeOfficeFilter(scope: OfficeScope, requestedOfficeId?: string) {
  if (scope.allOffices) {
    return requestedOfficeId ? { officeId: requestedOfficeId } : {};
  }
  if (!scope.officeIds.length) throw new AppError(403, "NO_OFFICE_ASSIGNMENT", "No offices assigned to this account");
  if (requestedOfficeId) {
    if (!scope.officeIds.includes(requestedOfficeId)) throw new AppError(403, "OFFICE_FORBIDDEN", "You do not manage this office");
    return { officeId: requestedOfficeId };
  }
  return { officeId: { in: scope.officeIds } };
}

/** Prisma filter on Timesheet.officeId or nested employee.officeId */
export function timesheetOfficeFilter(scope: OfficeScope, requestedOfficeId?: string) {
  const employeePart = employeeOfficeFilter(scope, requestedOfficeId);
  if ("officeId" in employeePart && typeof employeePart.officeId === "string") {
    return { officeId: employeePart.officeId };
  }
  if ("officeId" in employeePart && employeePart.officeId && typeof employeePart.officeId === "object" && "in" in employeePart.officeId) {
    return { officeId: employeePart.officeId };
  }
  return {};
}

export function employeeRelationOfficeFilter(scope: OfficeScope, requestedOfficeId?: string) {
  const part = employeeOfficeFilter(scope, requestedOfficeId);
  return { employee: part };
}
