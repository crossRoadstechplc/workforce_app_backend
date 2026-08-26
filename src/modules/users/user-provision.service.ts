import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ROLE } from "../../shared/tenancy.js";

export type Tx = Prisma.TransactionClient;

type UserWithRoles = {
  id: string;
  mustChangePassword: boolean;
  userRoles: Array<{ role: { name: string } }>;
  memberships: Array<{ organizationId: string }>;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string, tx: Tx | typeof prisma = prisma) {
  return tx.user.findUnique({
    where: { email: normalizeEmail(email) },
    include: {
      userRoles: { include: { role: true } },
      memberships: true,
      employee: true
    }
  });
}

function hasRole(user: UserWithRoles, roleName: string) {
  return user.userRoles.some((entry) => entry.role.name === roleName);
}

function hasOrgMembership(user: UserWithRoles, organizationId: string) {
  return user.memberships.some((entry) => entry.organizationId === organizationId);
}

export function assertNotPlatformAdmin(user: UserWithRoles) {
  if (hasRole(user, ROLE.SUPER_ADMIN)) {
    throw new AppError(409, "PLATFORM_ACCOUNT", "Platform administrator accounts cannot be assigned tenant roles");
  }
}

export async function ensureOrgMembership(userId: string, organizationId: string, tx: Tx) {
  await tx.organizationMembership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    update: {},
    create: { userId, organizationId }
  });
}

export async function ensureRole(userId: string, roleName: string, tx: Tx) {
  const role = await tx.role.findUnique({ where: { name: roleName } });
  if (!role) throw new AppError(500, "ROLE_NOT_CONFIGURED", `${roleName} role is not configured`);
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  });
}

export async function ensureAdminOffices(userId: string, officeIds: string[], tx: Tx) {
  for (const officeId of officeIds) {
    await tx.adminOffice.upsert({
      where: { userId_officeId: { userId, officeId } },
      update: {},
      create: { userId, officeId }
    });
  }
}

export async function assertCanBecomeEmployee(userId: string, organizationId: string, tx: Tx) {
  const existing = await tx.employee.findUnique({ where: { userId } });
  if (!existing) return;
  if (existing.organizationId === organizationId) {
    throw new AppError(409, "EMPLOYEE_ALREADY_EXISTS", "This user is already an employee in this organization");
  }
  throw new AppError(409, "EMPLOYEE_OTHER_ORG", "This user is already an employee in another organization");
}

export async function assertCanAssignOrgAdmin(user: UserWithRoles, organizationId: string) {
  assertNotPlatformAdmin(user);
  if (hasRole(user, ROLE.ORG_ADMIN) && hasOrgMembership(user, organizationId)) {
    throw new AppError(409, "ROLE_ALREADY_ASSIGNED", "This user is already a company administrator for this organization");
  }
}

export async function assertCanInviteEmployee(email: string, organizationId: string, tx: Tx | typeof prisma = prisma) {
  const user = await findUserByEmail(email, tx);
  if (!user) return;
  assertNotPlatformAdmin(user);
  await assertCanBecomeEmployee(user.id, organizationId, tx);
}

export async function inviteRequiresPassword(email: string, userId?: string | null) {
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { mustChangePassword: true } });
    return user?.mustChangePassword ?? true;
  }
  const user = await findUserByEmail(email);
  return !user || user.mustChangePassword;
}

export async function resolveUserForOrgAdmin(
  tx: Tx,
  input: { email: string; organizationId: string; passwordHash: string; mustChangePassword?: boolean }
) {
  const existing = await findUserByEmail(input.email, tx);
  if (!existing) {
    const user = await tx.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        mustChangePassword: input.mustChangePassword ?? true
      }
    });
    await ensureRole(user.id, ROLE.ORG_ADMIN, tx);
    await ensureOrgMembership(user.id, input.organizationId, tx);
    return { userId: user.id, created: true as const };
  }

  assertCanAssignOrgAdmin(existing, input.organizationId);
  await ensureRole(existing.id, ROLE.ORG_ADMIN, tx);
  await ensureOrgMembership(existing.id, input.organizationId, tx);
  return { userId: existing.id, created: false as const };
}

export async function resolveUserForOfficeAdmin(
  tx: Tx,
  input: {
    email: string;
    organizationId: string;
    officeIds: string[];
    passwordHash: string;
    mustChangePassword?: boolean;
  }
) {
  const existing = await findUserByEmail(input.email, tx);
  if (!existing) {
    const user = await tx.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        mustChangePassword: input.mustChangePassword ?? true
      }
    });
    await ensureRole(user.id, ROLE.OFFICE_ADMIN, tx);
    await ensureOrgMembership(user.id, input.organizationId, tx);
    await ensureAdminOffices(user.id, input.officeIds, tx);
    return { userId: user.id, created: true as const };
  }

  assertNotPlatformAdmin(existing);
  await ensureRole(existing.id, ROLE.OFFICE_ADMIN, tx);
  await ensureOrgMembership(existing.id, input.organizationId, tx);
  await ensureAdminOffices(existing.id, input.officeIds, tx);
  return { userId: existing.id, created: false as const };
}
