import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { generateTemporaryPassword } from "../../shared/password.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { ROLE } from "../../shared/tenancy.js";

async function assertOfficesInOrg(organizationId: string, officeIds: string[]) {
  const offices = await prisma.office.findMany({ where: { id: { in: officeIds }, organizationId, isActive: true } });
  if (offices.length !== officeIds.length) throw new AppError(400, "INVALID_OFFICE", "One or more offices are invalid for this organization");
}

export const officeAdminService = {
  async create(organizationId: string, input: { email: string; officeIds: string[]; temporaryPassword?: string }, audit: AuditContext) {
    await assertOfficesInOrg(organizationId, input.officeIds);
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const user = await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { name: ROLE.OFFICE_ADMIN } });
      if (!role) throw new AppError(500, "ROLE_NOT_CONFIGURED", "OFFICE_ADMIN role is not configured");

      const existingEmail = await tx.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (existingEmail) throw new AppError(409, "EMAIL_EXISTS", "Email is already registered");

      const created = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          mustChangePassword: true,
          userRoles: { create: { roleId: role.id } },
          memberships: { create: { organizationId } },
          adminOffices: { create: input.officeIds.map((officeId) => ({ officeId })) }
        },
        include: {
          adminOffices: { include: { office: { select: { id: true, name: true } } } },
          userRoles: { include: { role: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "OFFICE_ADMIN_CREATED",
          entityType: "User",
          entityId: created.id,
          newValues: { email: created.email, organizationId, officeIds: input.officeIds, roles: [ROLE.OFFICE_ADMIN] },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return created;
    });

    return { user, temporaryPassword };
  },

  async list(organizationId: string, input: { page: number; pageSize: number; search?: string; status?: "ACTIVE" | "INACTIVE" | "LOCKED"; officeId?: string }) {
    const where = {
      userRoles: { some: { role: { name: ROLE.OFFICE_ADMIN } } },
      memberships: { some: { organizationId } },
      ...(input.status ? { status: input.status } : {}),
      ...(input.search ? { email: { contains: input.search, mode: "insensitive" as const } } : {}),
      ...(input.officeId ? { adminOffices: { some: { officeId: input.officeId } } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination(input),
        include: {
          adminOffices: { include: { office: { select: { id: true, name: true, isActive: true } } } },
          userRoles: { include: { role: { select: { name: true } } } }
        }
      }),
      prisma.user.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async get(organizationId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        userRoles: { some: { role: { name: ROLE.OFFICE_ADMIN } } },
        memberships: { some: { organizationId } }
      },
      include: {
        adminOffices: { include: { office: { select: { id: true, name: true, isActive: true, organizationId: true } } } },
        userRoles: { include: { role: true } }
      }
    });
    if (!user) throw new AppError(404, "OFFICE_ADMIN_NOT_FOUND", "Office administrator not found");
    return user;
  },

  async updateOffices(organizationId: string, userId: string, officeIds: string[], audit: AuditContext) {
    const current = await this.get(organizationId, userId);
    await assertOfficesInOrg(organizationId, officeIds);
    return prisma.$transaction(async (tx) => {
      await tx.adminOffice.deleteMany({ where: { userId } });
      await tx.adminOffice.createMany({ data: officeIds.map((officeId) => ({ userId, officeId })) });
      const updated = await tx.user.findUnique({
        where: { id: userId },
        include: { adminOffices: { include: { office: { select: { id: true, name: true } } } } }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "OFFICE_ADMIN_OFFICES_UPDATED",
          entityType: "User",
          entityId: userId,
          oldValues: auditJson(current.adminOffices),
          newValues: auditJson(updated?.adminOffices ?? []),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return updated!;
    });
  },

  async changeStatus(organizationId: string, userId: string, input: { status: "ACTIVE" | "INACTIVE"; reason: string }, audit: AuditContext) {
    const current = await this.get(organizationId, userId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { status: input.status } });
      if (input.status !== "ACTIVE") {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "OFFICE_ADMIN_STATUS_CHANGED",
          entityType: "User",
          entityId: userId,
          oldValues: { status: current.status },
          newValues: { status: input.status },
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  },

  async resetPassword(organizationId: string, userId: string, input: { temporaryPassword?: string; reason: string }, audit: AuditContext) {
    const current = await this.get(organizationId, userId);
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true, status: "ACTIVE" } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "OFFICE_ADMIN_PASSWORD_RESET",
          entityType: "User",
          entityId: userId,
          oldValues: { mustChangePassword: current.mustChangePassword },
          newValues: { mustChangePassword: true, sessionsRevoked: true },
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    });
    return { userId, temporaryPassword, mustChangePassword: true };
  }
};
