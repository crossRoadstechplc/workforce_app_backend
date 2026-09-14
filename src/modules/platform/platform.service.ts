import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { generateTemporaryPassword } from "../../shared/password.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { ROLE } from "../../shared/tenancy.js";
import { createInviteInTx, deliverInvite } from "../invites/invite.service.js";
import { resolveUserForOrgAdmin, syncOrgAdminTenantState } from "../users/user-provision.service.js";

const DEFAULT_LEAVE_TYPES: Array<{ name: string; code: "ANNUAL" | "SICK" | "EMERGENCY" | "UNPAID" | "OTHER"; tracksBalance: boolean }> = [
  { name: "Annual Leave", code: "ANNUAL", tracksBalance: true },
  { name: "Sick Leave", code: "SICK", tracksBalance: false },
  { name: "Emergency Leave", code: "EMERGENCY", tracksBalance: false },
  { name: "Unpaid Leave", code: "UNPAID", tracksBalance: false },
  { name: "Other Leave", code: "OTHER", tracksBalance: false }
];

export const platformService = {
  async dashboard() {
    const [organizations, activeOrganizations, orgAdmins, employees, offices] = await prisma.$transaction([
      prisma.organization.count(),
      prisma.organization.count({ where: { isActive: true } }),
      prisma.adminOrganization.count(),
      prisma.employee.count(),
      prisma.office.count()
    ]);
    return { organizations, activeOrganizations, orgAdmins, employees, offices };
  },

  async createOrganization(
    input: { name: string; slug: string; isActive?: boolean; adminEmail?: string; sendInvite?: boolean },
    audit: AuditContext
  ) {
    const slug = input.slug.toLowerCase();
    const organization = await prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({ where: { slug } });
      if (existing) throw new AppError(409, "ORG_SLUG_EXISTS", "Organization slug already exists");
      const created = await tx.organization.create({
        data: { name: input.name, slug, isActive: input.isActive ?? true }
      });
      for (const type of DEFAULT_LEAVE_TYPES) {
        await tx.leaveType.create({
          data: { organizationId: created.id, name: type.name, code: type.code, tracksBalance: type.tracksBalance, isActive: true }
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORGANIZATION_CREATED",
          entityType: "Organization",
          entityId: created.id,
          newValues: auditJson(created),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return created;
    });

    if (!input.adminEmail) return organization;
    const admin = await this.createOrgAdmin(
      {
        organizationId: organization.id,
        email: input.adminEmail,
        deliveryMethod: input.sendInvite ? "SEND_EMAIL" : "SHOW_PASSWORD"
      },
      audit
    );
    return { ...organization, admin };
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

  async createOrgAdmin(
    input: { organizationId: string; email: string; temporaryPassword?: string; deliveryMethod?: "SHOW_PASSWORD" | "SEND_EMAIL" },
    audit: AuditContext
  ) {
    const organization = await this.getOrganization(input.organizationId);
    if (!organization.isActive) throw new AppError(400, "ORG_INACTIVE", "Cannot add admins to an inactive organization");
    const email = input.email.trim().toLowerCase();
    const deliveryMethod = input.deliveryMethod ?? "SHOW_PASSWORD";
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const result = await prisma.$transaction(async (tx) => {
      const { userId, created } = await resolveUserForOrgAdmin(tx, {
        email,
        organizationId: organization.id,
        passwordHash,
        mustChangePassword: true
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          memberships: { include: { organization: true } },
          adminOrganizations: { include: { organization: { select: { id: true, name: true, slug: true, isActive: true } } } },
          userRoles: { include: { role: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: created ? "ORG_ADMIN_CREATED" : "ORG_ADMIN_ROLE_ATTACHED",
          entityType: "User",
          entityId: user.id,
          newValues: { email: user.email, organizationId: organization.id, roles: [ROLE.ORG_ADMIN], attachedToExistingUser: !created },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });

      if (deliveryMethod !== "SEND_EMAIL") return { user, created, invite: null as Awaited<ReturnType<typeof createInviteInTx>>["invite"] | null, token: null as string | null };

      const issued = await createInviteInTx(tx, {
        type: "ORG_ADMIN",
        email: user.email,
        organizationId: organization.id,
        invitedByUserId: audit.actorUserId,
        userId: user.id
      });
      return { user, created, invite: issued.invite, token: issued.token };
    });

    if (deliveryMethod === "SEND_EMAIL" && result.invite && result.token) {
      const delivery = await deliverInvite(result.invite, result.token);
      return {
        user: result.user,
        emailSent: delivery.emailSent,
        inviteId: result.invite.id,
        existingAccount: !result.created,
        requiresPassword: delivery.requiresPassword,
        ...("emailError" in delivery ? { emailError: delivery.emailError } : {})
      };
    }

    return result.created
      ? { user: result.user, temporaryPassword, existingAccount: false as const }
      : { user: result.user, existingAccount: true as const, requiresPassword: false as const };
  },

  async listOrgAdmins(input: { page: number; pageSize: number; organizationId?: string; search?: string; status?: "ACTIVE" | "INACTIVE" | "LOCKED" }) {
    const where = {
      adminOrganizations: { some: input.organizationId ? { organizationId: input.organizationId } : {} },
      ...(input.status ? { status: input.status } : {}),
      ...(input.search ? { email: { contains: input.search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination(input),
        include: {
          memberships: { include: { organization: { select: { id: true, name: true, slug: true, isActive: true } } } },
          adminOrganizations: { include: { organization: { select: { id: true, name: true, slug: true, isActive: true } } } },
          userRoles: { include: { role: { select: { name: true } } } }
        }
      }),
      prisma.user.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async getOrgAdmin(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, adminOrganizations: { some: {} } },
      include: {
        memberships: { include: { organization: true } },
        adminOrganizations: { include: { organization: true } },
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
  },

  async unassignOrgAdmin(organizationId: string, userId: string, audit: AuditContext) {
    await this.getOrganization(organizationId);
    const assignment = await prisma.adminOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } }
    });
    if (!assignment) throw new AppError(404, "ORG_ADMIN_NOT_FOUND", "This user is not a company administrator for this organization");

    await prisma.$transaction(async (tx) => {
      const remaining = await tx.adminOrganization.count({ where: { organizationId } });
      if (remaining <= 1) {
        throw new AppError(409, "LAST_ORG_ADMIN", "Cannot remove the last company administrator for this organization");
      }
      await tx.adminOrganization.delete({ where: { userId_organizationId: { userId, organizationId } } });
      await syncOrgAdminTenantState(userId, organizationId, tx);
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "ORG_ADMIN_UNASSIGNED",
          entityType: "User",
          entityId: userId,
          oldValues: { organizationId },
          newValues: { organizationId: null },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { userId, organizationId };
  }
};
