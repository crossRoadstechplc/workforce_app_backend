import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "./token.service.js";

type IdentityDb = Pick<typeof prisma, "user">;
type SessionDb = Pick<typeof prisma, "user" | "refreshToken">;

async function identity(userId: string, db: IdentityDb = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
  if (!user || user.status !== "ACTIVE") throw new AppError(401, "INVALID_SESSION", "Session is no longer valid");
  const roles = user.userRoles.map((item) => item.role.name);
  const permissions = [...new Set(user.userRoles.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)))];
  return { user, roles, permissions };
}

async function issueSession(userId: string, deviceId?: string, db: SessionDb = prisma) {
  const { user, roles, permissions } = await identity(userId, db);
  const restricted = user.mustChangePassword;
  const accessToken = await signAccessToken({ userId, roles, permissions: restricted ? [] : permissions, restricted });
  const refreshToken = await signRefreshToken(userId);
  await db.refreshToken.create({ data: { userId, tokenHash: hashToken(refreshToken), deviceId, expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000) } });
  return { accessToken, refreshToken, mustChangePassword: restricted, user: { id: user.id, email: user.email, roles } };
}

export const authService = {
  async login(input: { login: string; password: string; deviceId?: string }) {
    const normalizedLogin = input.login.trim();
    const user = await prisma.user.findFirst({ where: { OR: [{ email: normalizedLogin.toLowerCase() }, { employee: { employeeCode: normalizedLogin.toUpperCase() } }] } });
    if (!user || user.status !== "ACTIVE" || !(await argon2.verify(user.passwordHash, input.password))) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid login or password");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return issueSession(user.id, input.deviceId);
  },
  async refresh(input: { refreshToken: string; deviceId?: string }) {
    const { userId } = await verifyRefreshToken(input.refreshToken).catch(() => { throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token"); });
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(input.refreshToken) } });
    if (!stored || stored.userId !== userId || stored.revokedAt || stored.expiresAt <= new Date()) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is expired or revoked");
    return prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
      const session = await issueSession(userId, input.deviceId ?? stored.deviceId ?? undefined, tx);
      await tx.refreshToken.update({ where: { id: stored.id }, data: { replacedByTokenId: (await tx.refreshToken.findUnique({ where: { tokenHash: hashToken(session.refreshToken) }, select: { id: true } }))?.id } });
      return session;
    });
  },
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) throw new AppError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
    if (await argon2.verify(user.passwordHash, newPassword)) throw new AppError(400, "PASSWORD_REUSED", "New password must be different");
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
    return issueSession(userId);
  },
  async logout(userId: string, refreshToken: string) {
    await prisma.refreshToken.updateMany({ where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  },
  identity
};
