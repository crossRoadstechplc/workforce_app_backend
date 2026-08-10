import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { generateTemporaryPassword } from "../../shared/password.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { ROLE } from "../../shared/tenancy.js";

const DEFAULT_LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Emergency Leave", "Unpaid Leave", "Other Leave"];

export const platformService = {
  async dashboard() {
    const [organizations, activeOrganizations, orgAdmins, employees, offices] = await prisma.$transaction([
      prisma.organization.count(),
      prisma.organization.count({ where: { isActive: true } }),
      prisma.userRole.count({ where: { role: { name: ROLE.ORG_ADMIN } } }),
      prisma.employee.count(),
      prisma.office.count()
    ]);
    return { organizations, activeOrganizations, orgAdmins, employees, offices };
  },

  async createOrganization(input: { name: string; slug: string; isActive?: boolean }, audit: AuditContext) {
    const slug = input.slug.toLowerCase();
    return prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({ where: { slug } });
      if (existing) throw new AppError(409, "ORG_SLUG_EXISTS", "Organization slug already exists");
      const organization = await tx.organization.create({
        data: { name: input.name, slug, isActive: input.isActive ?? true }
      });
      for (const name of DEFAULT_LEAVE_TYPES) {
        await tx.leaveType.create({ data: { organizationId: organization.id, name, isActive: true } });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORGANIZATION_CREATED",
          entityType: "Organization",
          entityId: organization.id,
          newValues: auditJson(organization),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return organization;
    });
  },

  async listOrganizations(input: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const where = {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" as const } },
              { slug: { contains: input.search, mode: "insensitive" as const } }
            ]
          }
        : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination(input),
        include: {
          _count: { select: { offices: true, employees: true, memberships: true } }
        }
      }),
      prisma.organization.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async getOrganization(organizationId: string) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { _count: { select: { offices: true, employees: true, memberships: true, schedules: true } } }
    });
    if (!organization) throw new AppError(404, "ORG_NOT_FOUND", "Organization not found");
    return organization;
  },

  async updateOrganization(organizationId: string, input: Partial<{ name: string; slug: string; isActive: boolean }>, audit: AuditContext) {
    const current = await this.getOrganization(organizationId);
    if (input.slug && input.slug !== current.slug) {
      const clash = await prisma.organization.findUnique({ where: { slug: input.slug.toLowerCase() } });
      if (clash) throw new AppError(409, "ORG_SLUG_EXISTS", "Organization slug already exists");
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug.toLowerCase() } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORGANIZATION_UPDATED",
          entityType: "Organization",
          entityId: organizationId,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  },

  async changeOrganizationStatus(organizationId: string, input: { isActive: boolean; reason: string }, audit: AuditContext) {
    const current = await this.getOrganization(organizationId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({ where: { id: organizationId }, data: { isActive: input.isActive } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORGANIZATION_STATUS_CHANGED",
          entityType: "Organization",
          entityId: organizationId,
          oldValues: { isActive: current.isActive },
          newValues: { isActive: input.isActive },
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  },

  async createOrgAdmin(input: { organizationId: string; email: string; temporaryPassword?: string }, audit: AuditContext) {
    const organization = await this.getOrganization(input.organizationId);
    if (!organization.isActive) throw new AppError(400, "ORG_INACTIVE", "Cannot add admins to an inactive organization");
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const result = await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { name: ROLE.ORG_ADMIN } });
      if (!role) throw new AppError(500, "ROLE_NOT_CONFIGURED", "ORG_ADMIN role is not configured");

      const existingEmail = await tx.user.findUnique({ where: { email: input.email } });
      if (existingEmail) throw new AppError(409, "EMAIL_EXISTS", "Email is already registered");

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          mustChangePassword: true,
          userRoles: { create: { roleId: role.id } },
          memberships: { create: { organizationId: organization.id } }
        },
        include: { memberships: { include: { organization: true } }, userRoles: { include: { role: true } } }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORG_ADMIN_CREATED",
          entityType: "User",
          entityId: user.id,
          newValues: { email: user.email, organizationId: organization.id, roles: [ROLE.ORG_ADMIN] },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return user;
    });

    return { user: result, temporaryPassword };
  },

  async listOrgAdmins(input: { page: number; pageSize: number; organizationId?: string; search?: string; status?: "ACTIVE" | "INACTIVE" | "LOCKED" }) {
    const where = {
      userRoles: { some: { role: { name: ROLE.ORG_ADMIN } } },
      ...(input.status ? { status: input.status } : {}),
      ...(input.organizationId ? { memberships: { some: { organizationId: input.organizationId } } } : {}),
      ...(input.search ? { email: { contains: input.search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination(input),
        include: {
          memberships: { include: { organization: { select: { id: true, name: true, slug: true, isActive: true } } } },
          userRoles: { include: { role: { select: { name: true } } } }
        }
      }),
      prisma.user.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async getOrgAdmin(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, userRoles: { some: { role: { name: ROLE.ORG_ADMIN } } } },
      include: {
        memberships: { include: { organization: true } },
        userRoles: { include: { role: true } }
      }
    });
    if (!user) throw new AppError(404, "ORG_ADMIN_NOT_FOUND", "Organization admin not found");
    return user;
  },

  async changeOrgAdminStatus(userId: string, input: { status: "ACTIVE" | "INACTIVE"; reason: string }, audit: AuditContext) {
    const current = await this.getOrgAdmin(userId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { status: input.status } });
      if (input.status !== "ACTIVE") {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORG_ADMIN_STATUS_CHANGED",
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

  async resetOrgAdminPassword(userId: string, input: { temporaryPassword?: string; reason: string }, audit: AuditContext) {
    const current = await this.getOrgAdmin(userId);
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true, status: "ACTIVE" } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORG_ADMIN_PASSWORD_RESET",
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
