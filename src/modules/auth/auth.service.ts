import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import {
  getAvailableContexts,
  resolveScopedIdentity,
  type ScopedIdentity
} from "./context.service.js";
import { isPortalContextType, resolveDefaultContextKey, type LoginContext } from "./context.types.js";
import {
  hashToken,
  signAccessToken,
  signPreAuthToken,
  signRefreshToken,
  verifyPreAuthToken,
  verifyRefreshToken
} from "./token.service.js";

type SessionDb = Pick<typeof prisma, "user" | "refreshToken" | "organizationMembership">;

function sessionUserFromIdentity(identity: ScopedIdentity) {
  return {
    id: identity.user.id,
    email: identity.user.email,
    roles: identity.roles,
    organizationId: identity.organizationId,
    organization: identity.organization,
    officeIds: identity.officeIds,
    offices: identity.offices,
    employee: identity.employee,
    activeContext: identity.activeContext
  };
}

async function resolveContextKeyForUser(userId: string, preferredKey?: string | null) {
  const contexts = await getAvailableContexts(userId);
  if (!contexts.length) throw new AppError(403, "NO_CONTEXT", "No login context is available for this account");
  const key = preferredKey ? contexts.find((item) => item.key === preferredKey)?.key : undefined;
  return key ?? resolveDefaultContextKey(contexts) ?? contexts[0]!.key;
}

async function issueSession(userId: string, contextKey: string, deviceId?: string, db: SessionDb = prisma) {
  const identity = await resolveScopedIdentity(userId, contextKey);
  const restricted = identity.user.mustChangePassword;
  const accessToken = await signAccessToken({
    userId,
    roles: identity.roles,
    permissions: restricted ? [] : identity.permissions,
    restricted,
    organizationId: identity.organizationId,
    officeIds: identity.officeIds,
    activeContext: identity.activeContext
  });
  const refreshToken = await signRefreshToken(userId, contextKey);
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
    user: sessionUserFromIdentity(identity),
    activeContext: identity.activeContext
  };
}

async function verifyCredentials(input: { login: string; password: string; organizationSlug?: string }) {
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

  return userId;
}

/** Resolves identity for the active or default login context. */
async function identity(userId: string, contextKey?: string | null) {
  const key = contextKey ?? (await resolveContextKeyForUser(userId));
  return resolveScopedIdentity(userId, key);
}

export const authService = {
  async login(input: {
    login: string;
    password: string;
    deviceId?: string;
    organizationSlug?: string;
    contextKey?: string;
    lastContextKey?: string;
  }) {
    const userId = await verifyCredentials(input);
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

    const contexts = await getAvailableContexts(userId);
    const defaultContextKey = resolveDefaultContextKey(contexts, input.lastContextKey ?? input.contextKey);

    if (input.contextKey) {
      return issueSession(userId, input.contextKey, input.deviceId);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { mustChangePassword: true } });
    if (user?.mustChangePassword && defaultContextKey) {
      return issueSession(userId, defaultContextKey, input.deviceId);
    }

    if (contexts.length <= 1 && defaultContextKey) {
      return issueSession(userId, defaultContextKey, input.deviceId);
    }

    const preAuthToken = await signPreAuthToken(userId);
    return {
      requiresContextSelection: true,
      preAuthToken,
      contexts,
      defaultContextKey
    };
  },

  async selectContext(input: { preAuthToken: string; contextKey: string; deviceId?: string }) {
    const { userId } = await verifyPreAuthToken(input.preAuthToken).catch(() => {
      throw new AppError(401, "INVALID_PRE_AUTH", "Login session expired. Please sign in again.");
    });
    return issueSession(userId, input.contextKey, input.deviceId);
  },

  async switchContext(userId: string, contextKey: string, input?: { deviceId?: string; refreshToken?: string }) {
    if (input?.refreshToken) {
      const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(input.refreshToken) } });
      if (!stored || stored.userId !== userId || stored.revokedAt || stored.expiresAt <= new Date()) {
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is expired or revoked");
      }
      return prisma.$transaction(async (tx) => {
        await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
        return issueSession(userId, contextKey, input.deviceId ?? stored.deviceId ?? undefined, tx);
      });
    }
    return issueSession(userId, contextKey, input?.deviceId);
  },

  async listContexts(userId: string) {
    const contexts = await getAvailableContexts(userId);
    return { contexts };
  },

  async refresh(input: { refreshToken: string; deviceId?: string }) {
    const verified = await verifyRefreshToken(input.refreshToken).catch(() => {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
    });
    const { userId, activeContextKey } = verified;
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(input.refreshToken) } });
    if (!stored || stored.userId !== userId || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is expired or revoked");
    }

    const contextKey = activeContextKey ?? (await resolveContextKeyForUser(userId));

    return prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      const session = await issueSession(userId, contextKey, input.deviceId ?? stored.deviceId ?? undefined, tx);
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

  async changePassword(userId: string, currentPassword: string, newPassword: string, activeContextKey?: string | null) {
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
    const contextKey = activeContextKey ?? (await resolveContextKeyForUser(userId));
    return issueSession(userId, contextKey);
  },

  async logout(userId: string, refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  },

  identity,

  filterPortalContexts(contexts: LoginContext[]) {
    return contexts.filter((item) => isPortalContextType(item.type));
  }
};
