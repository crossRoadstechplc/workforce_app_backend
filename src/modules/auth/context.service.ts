import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ROLE } from "../../shared/tenancy.js";
import {
  buildContextKey,
  parseContextKey,
  type ActiveContext,
  type ContextType,
  type LoginContext
} from "./context.types.js";

type UserWithRelations = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: { include: { permissions: { include: { permission: true } } } } }
      },
      memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } },
      adminOffices: {
        include: { office: { select: { id: true, name: true, isActive: true, organizationId: true } } }
      },
      employee: { include: { organization: true, office: { select: { id: true, name: true } } } }
    }
  });
}

function roleNames(user: UserWithRelations) {
  return user.userRoles.map((item) => item.role.name);
}

function permissionsForRoles(user: UserWithRelations, roleNamesToInclude: string[]) {
  const allowed = new Set(roleNamesToInclude);
  return [
    ...new Set(
      user.userRoles
        .filter((item) => allowed.has(item.role.name))
        .flatMap((item) => item.role.permissions.map((entry) => entry.permission.code))
    )
  ];
}

function organizationSummary(org: { id: string; name: string; slug: string; isActive: boolean }) {
  return { id: org.id, name: org.name, slug: org.slug, isActive: org.isActive };
}

function orgLabel(name: string, suffix: string) {
  return `${name} · ${suffix}`;
}

export async function getAvailableContexts(userId: string): Promise<LoginContext[]> {
  const user = await loadUser(userId);
  if (!user || user.status !== "ACTIVE") throw new AppError(401, "INVALID_SESSION", "Session is no longer valid");
  return buildContextsForUser(user);
}

export function buildContextsForUser(user: UserWithRelations): LoginContext[] {
  const roles = roleNames(user);
  const contexts: LoginContext[] = [];

  if (roles.includes(ROLE.SUPER_ADMIN)) {
    contexts.push({
      key: buildContextKey("platform"),
      type: "platform",
      label: "SPX Platform Admin",
      organizationId: null,
      organizationName: null,
      officeIds: [],
      officeNames: []
    });
  }

  const orgMap = new Map<string, { id: string; name: string; slug: string; isActive: boolean }>();
  for (const membership of user.memberships) {
    orgMap.set(membership.organizationId, organizationSummary(membership.organization));
  }
  if (user.employee?.organization) {
    orgMap.set(user.employee.organizationId, organizationSummary(user.employee.organization));
  }

  for (const [organizationId, org] of orgMap) {
    if (!org.isActive) continue;
    const hasMembership = user.memberships.some((entry) => entry.organizationId === organizationId);

    if (roles.includes(ROLE.ORG_ADMIN) && hasMembership) {
      contexts.push({
        key: buildContextKey("org_admin", organizationId),
        type: "org_admin",
        label: orgLabel(org.name, "Company Admin"),
        organizationId,
        organizationName: org.name,
        officeIds: [],
        officeNames: []
      });
    }

    if (roles.includes(ROLE.OFFICE_ADMIN)) {
      const offices = user.adminOffices
        .filter((entry) => entry.office.isActive && entry.office.organizationId === organizationId)
        .map((entry) => ({ id: entry.office.id, name: entry.office.name }));
      if (offices.length > 0) {
        contexts.push({
          key: buildContextKey("office_admin", organizationId),
          type: "office_admin",
          label: orgLabel(org.name, "Office Admin"),
          organizationId,
          organizationName: org.name,
          officeIds: offices.map((office) => office.id),
          officeNames: offices.map((office) => office.name)
        });
      }
    }

    if (roles.includes(ROLE.EMPLOYEE) && user.employee?.organizationId === organizationId) {
      const officeIds = user.employee.officeId ? [user.employee.officeId] : [];
      const officeNames = user.employee.office?.name ? [user.employee.office.name] : [];
      contexts.push({
        key: buildContextKey("employee", organizationId),
        type: "employee",
        label: orgLabel(org.name, "Employee"),
        organizationId,
        organizationName: org.name,
        officeIds,
        officeNames
      });
    }
  }

  return contexts;
}

function assertContextAllowed(user: UserWithRelations, contextKey: string): LoginContext {
  const contexts = buildContextsForUser(user);
  const match = contexts.find((item) => item.key === contextKey);
  if (!match) throw new AppError(403, "INVALID_CONTEXT", "The selected login context is not available");
  return match;
}

function buildEmployeeDisplayName(firstName: string, lastName: string, email: string) {
  const full = `${firstName} ${lastName}`.trim();
  if (full) return full;
  const prefix = email.split("@")[0]?.trim();
  return prefix || email;
}

export type ScopedIdentity = {
  user: UserWithRelations;
  roles: string[];
  permissions: string[];
  organizationId: string | null;
  organization: ReturnType<typeof organizationSummary> | null;
  officeIds: string[];
  offices: { id: string; name: string }[];
  employee: {
    firstName: string;
    lastName: string;
    employeeCode: string;
    displayName: string;
  } | null;
  activeContext: ActiveContext;
};

export async function resolveScopedIdentity(userId: string, contextKey: string): Promise<ScopedIdentity> {
  const user = await loadUser(userId);
  if (!user || user.status !== "ACTIVE") throw new AppError(401, "INVALID_SESSION", "Session is no longer valid");

  assertContextAllowed(user, contextKey);
  const { type, organizationId } = parseContextKey(contextKey);
  const context = buildContextsForUser(user).find((item) => item.key === contextKey)!;

  let roles: string[] = [];
  let permissions: string[] = [];
  const resolvedOrganizationId: string | null = organizationId;
  let organization = context.organizationId
    ? user.memberships.find((entry) => entry.organizationId === context.organizationId)?.organization ??
      (user.employee?.organizationId === context.organizationId ? user.employee.organization : null) ??
      null
    : null;
  const officeIds: string[] = context.officeIds;
  const offices = context.officeIds.map((id, index) => ({ id, name: context.officeNames[index] ?? "Office" }));

  switch (type as ContextType) {
    case "platform":
      roles = [ROLE.SUPER_ADMIN];
      permissions = permissionsForRoles(user, [ROLE.SUPER_ADMIN]);
      break;
    case "org_admin":
      roles = [ROLE.ORG_ADMIN];
      permissions = permissionsForRoles(user, [ROLE.ORG_ADMIN, "ADMIN"]);
      break;
    case "office_admin":
      roles = [ROLE.OFFICE_ADMIN];
      permissions = permissionsForRoles(user, [ROLE.OFFICE_ADMIN]);
      if (officeIds.length === 0) throw new AppError(403, "NO_OFFICE_ASSIGNMENT", "Office administrator has no assigned offices");
      break;
    case "employee":
      roles = [ROLE.EMPLOYEE];
      permissions = permissionsForRoles(user, [ROLE.EMPLOYEE]);
      break;
  }

  if (type !== "platform") {
    if (!resolvedOrganizationId) throw new AppError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required");
    if (!organization) throw new AppError(403, "ORG_MEMBERSHIP_REQUIRED", "User is not assigned to an organization");
    if (!organization.isActive) throw new AppError(403, "ORG_INACTIVE", "Organization is inactive");
  }

  const employeeRecord = user.employee;
  const employee = employeeRecord
    ? {
        firstName: employeeRecord.firstName,
        lastName: employeeRecord.lastName,
        employeeCode: employeeRecord.employeeCode,
        displayName: buildEmployeeDisplayName(employeeRecord.firstName, employeeRecord.lastName, user.email)
      }
    : null;

  return {
    user,
    roles,
    permissions,
    organizationId: type === "platform" ? null : resolvedOrganizationId,
    organization: type === "platform" || !organization ? null : organizationSummary(organization),
    officeIds: type === "platform" || type === "org_admin" ? [] : officeIds,
    offices: type === "platform" || type === "org_admin" ? [] : offices,
    employee,
    activeContext: {
      key: context.key,
      type: context.type,
      organizationId: type === "platform" ? null : resolvedOrganizationId,
      officeIds: type === "platform" || type === "org_admin" ? [] : officeIds
    }
  };
}
