import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import { isOfficeAdmin, isOrgAdmin, ROLE } from "../../shared/tenancy.js";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "./token.service.js";

type IdentityDb = Pick<typeof prisma, "user" | "organizationMembership">;
type SessionDb = Pick<typeof prisma, "user" | "refreshToken" | "organizationMembership">;

async function identity(userId: string, db: IdentityDb = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      memberships: { include: { organization: true }, take: 1 },
      adminOffices: { include: { office: { select: { id: true, name: true, isActive: true, organizationId: true } } } }
    }
  });
  if (!user || user.status !== "ACTIVE") throw new AppError(401, "INVALID_SESSION", "Session is no longer valid");
  const roles = user.userRoles.map((item) => item.role.name);
  const permissions = [...new Set(user.userRoles.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)))];
  const isPlatform = roles.includes(ROLE.SUPER_ADMIN);
  const membership = user.memberships[0] ?? null;
  const organizationId = isPlatform ? null : membership?.organizationId ?? null;
  const organization = isPlatform ? null : membership?.organization
    ? { id: membership.organization.id, name: membership.organization.name, slug: membership.organization.slug, isActive: membership.organization.isActive }
    : null;
  if (!isPlatform && !organizationId) throw new AppError(403, "ORG_MEMBERSHIP_REQUIRED", "User is not assigned to an organization");
  if (organization && !organization.isActive) throw new AppError(403, "ORG_INACTIVE", "Organization is inactive");

  const scopedOfficeAdmin = isOfficeAdmin({ roles, permissions, restricted: false, organizationId, userId }) && !isOrgAdmin({ roles, permissions, restricted: false, organizationId, userId });
  const assignedOffices = user.adminOffices.filter((entry) => entry.office.isActive && entry.office.organizationId === organizationId);
  const officeIds = scopedOfficeAdmin ? assignedOffices.map((entry) => entry.officeId) : [];
  const offices = scopedOfficeAdmin ? assignedOffices.map((entry) => ({ id: entry.office.id, name: entry.office.name })) : [];

  if (scopedOfficeAdmin && officeIds.length === 0) {
    throw new AppError(403, "NO_OFFICE_ASSIGNMENT", "Office administrator has no assigned offices");
  }

  const employeeRecord = await prisma.employee.findUnique({
    where: { userId },
    select: { firstName: true, lastName: true, employeeCode: true }
  });
  const employee = employeeRecord
    ? {
        firstName: employeeRecord.firstName,
        lastName: employeeRecord.lastName,
        employeeCode: employeeRecord.employeeCode,
        displayName: buildEmployeeDisplayName(employeeRecord.firstName, employeeRecord.lastName, user.email)
      }
    : null;

  return { user, roles, permissions, organizationId, organization, officeIds, offices, employee };
}

function buildEmployeeDisplayName(firstName: string, lastName: string, email: string) {
  const full = `${firstName} ${lastName}`.trim();
  if (full) return full;
  const prefix = email.split("@")[0]?.trim();
  return prefix || email;
}

async function issueSession(userId: string, deviceId?: string, db: SessionDb = prisma) {
  const { user, roles, permissions, organizationId, organization, officeIds, offices, employee } = await identity(userId, db);
  const restricted = user.mustChangePassword;
  const accessToken = await signAccessToken({
    userId,
    roles,
    permissions: restricted ? [] : permissions,
    restricted,
    organizationId,
    officeIds
  });
  const refreshToken = await signRefreshToken(userId);
  await db.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      deviceId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000)
    }
  });
  return {
    accessToken,
    refreshToken,
    mustChangePassword: restricted,
    user: { id: user.id, email: user.email, roles, organizationId, organization, officeIds, offices, employee }
  };
}

export const authService = {
  async login(input: { login: string; password: string; deviceId?: string; organizationSlug?: string }) {
    const normalizedLogin = input.login.trim();
    const password = input.password.trim();
    const email = normalizedLogin.toLowerCase();
    const code = normalizedLogin.toUpperCase();

    let userId: string | null = null;
    const byEmail = await prisma.user.findFirst({ where: { email }, select: { id: true, status: true, passwordHash: true } });
    if (byEmail) {
      userId = byEmail.id;
      if (byEmail.status !== "ACTIVE" || !(await argon2.verify(byEmail.passwordHash, password))) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid login or password");
      }
    } else {
      const employeeWhere = input.organizationSlug
        ? { employeeCode: code, organization: { slug: input.organizationSlug.toLowerCase() } }
        : { employeeCode: code };
      const employee = await prisma.employee.findFirst({
        where: employeeWhere,
        include: { user: { select: { id: true, status: true, passwordHash: true } } }
      });
      if (!employee) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid login or password");
      if (!input.organizationSlug) {
        const collisions = await prisma.employee.count({ where: { employeeCode: code } });
        if (collisions > 1) {
          throw new AppError(400, "ORG_SLUG_REQUIRED", "Multiple organizations use this employee code. Provide organizationSlug.");
        }
      }
      if (employee.user.status !== "ACTIVE" || !(await argon2.verify(employee.user.passwordHash, password))) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid login or password");
      }
      userId = employee.user.id;
    }

    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return issueSession(userId, input.deviceId);
  },
  async refresh(input: { refreshToken: string; deviceId?: string }) {
    const { userId } = await verifyRefreshToken(input.refreshToken).catch(() => {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
    });
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(input.refreshToken) } });
    if (!stored || stored.userId !== userId || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is expired or revoked");
    }
    return prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      const session = await issueSession(userId, input.deviceId ?? stored.deviceId ?? undefined, tx);
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: {
          replacedByTokenId: (await tx.refreshToken.findUnique({
            where: { tokenHash: hashToken(session.refreshToken) },
            select: { id: true }
          }))?.id
        }
      });
      return session;
    });
  },
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
    }
    if (await argon2.verify(user.passwordHash, newPassword)) {
      throw new AppError(400, "PASSWORD_REUSED", "New password must be different");
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
    return issueSession(userId);
  },
  async logout(userId: string, refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  },
  identity
};
