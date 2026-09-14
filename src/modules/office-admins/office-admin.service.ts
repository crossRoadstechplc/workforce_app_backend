import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { generateTemporaryPassword } from "../../shared/password.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { ROLE } from "../../shared/tenancy.js";
import { createInviteInTx, deliverInvite } from "../invites/invite.service.js";
import { resolveUserForOfficeAdmin, syncOfficeAdminTenantState } from "../users/user-provision.service.js";

async function assertOfficesInOrg(organizationId: string, officeIds: string[]) {
  if (officeIds.length === 0) return;
  const uniqueIds = [...new Set(officeIds)];
  const offices = await prisma.office.findMany({ where: { id: { in: uniqueIds }, organizationId, isActive: true } });
  if (offices.length !== uniqueIds.length) throw new AppError(400, "INVALID_OFFICE", "One or more offices are invalid for this organization");
}

function officeAdminOfficeFilter(organizationId: string) {
  return {
    where: { office: { organizationId } },
    include: { office: { select: { id: true, name: true, isActive: true, organizationId: true } } }
  } as const;
}

export const officeAdminService = {
  async create(
    organizationId: string,
    input: { email: string; officeIds: string[]; temporaryPassword?: string; deliveryMethod?: "SHOW_PASSWORD" | "SEND_EMAIL" },
    audit: AuditContext
  ) {
    await assertOfficesInOrg(organizationId, input.officeIds);
    const email = input.email.trim().toLowerCase();
    const deliveryMethod = input.deliveryMethod ?? "SHOW_PASSWORD";
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const result = await prisma.$transaction(async (tx) => {
      const { userId, created } = await resolveUserForOfficeAdmin(tx, {
        email,
        organizationId,
        officeIds: input.officeIds,
        passwordHash,
        mustChangePassword: true
      });

      const createdUser = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          adminOffices: officeAdminOfficeFilter(organizationId),
          userRoles: { include: { role: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: created ? "OFFICE_ADMIN_CREATED" : "OFFICE_ADMIN_ROLE_ATTACHED",
          entityType: "User",
          entityId: createdUser.id,
          newValues: {
            email: createdUser.email,
            organizationId,
            officeIds: input.officeIds,
            roles: [ROLE.OFFICE_ADMIN],
            attachedToExistingUser: !created
          },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });

      if (deliveryMethod !== "SEND_EMAIL") {
        return { user: createdUser, created, invite: null as Awaited<ReturnType<typeof createInviteInTx>>["invite"] | null, token: null as string | null };
      }

      const issued = await createInviteInTx(tx, {
        type: "OFFICE_ADMIN",
        email: createdUser.email,
        organizationId,
        invitedByUserId: audit.actorUserId,
        userId: createdUser.id,
        officeIds: input.officeIds
      });
      return { user: createdUser, created, invite: issued.invite, token: issued.token };
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

  async list(organizationId: string, input: { page: number; pageSize: number; search?: string; status?: "ACTIVE" | "INACTIVE" | "LOCKED"; officeId?: string }) {
    const where = {
      userRoles: { some: { role: { name: ROLE.OFFICE_ADMIN } } },
      adminOffices: { some: { office: { organizationId }, ...(input.officeId ? { officeId: input.officeId } : {}) } },
      ...(input.status ? { status: input.status } : {}),
      ...(input.search ? { email: { contains: input.search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pagination(input),
        include: {
          adminOffices: officeAdminOfficeFilter(organizationId),
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
        adminOffices: { some: { office: { organizationId } } }
      },
      include: {
        adminOffices: officeAdminOfficeFilter(organizationId),
        userRoles: { include: { role: true } }
      }
    });
    if (!user) throw new AppError(404, "OFFICE_ADMIN_NOT_FOUND", "Office administrator not found");
    return user;
  },

  async updateOffices(organizationId: string, userId: string, officeIds: string[], audit: AuditContext) {
    const current = await this.get(organizationId, userId);
    const uniqueOfficeIds = [...new Set(officeIds)];
    await assertOfficesInOrg(organizationId, uniqueOfficeIds);
    return prisma.$transaction(async (tx) => {
      await tx.adminOffice.deleteMany({ where: { userId, office: { organizationId } } });
      if (uniqueOfficeIds.length) {
        await tx.adminOffice.createMany({ data: uniqueOfficeIds.map((officeId) => ({ userId, officeId })) });
      }
      await syncOfficeAdminTenantState(userId, organizationId, tx);
      const updated = await tx.user.findUnique({
        where: { id: userId },
        include: { adminOffices: officeAdminOfficeFilter(organizationId) }
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

  async unassignFromOffice(organizationId: string, officeId: string, userId: string, audit: AuditContext) {
    const office = await prisma.office.findFirst({ where: { id: officeId, organizationId } });
    if (!office) throw new AppError(404, "OFFICE_NOT_FOUND", "Office not found");
    const assignment = await prisma.adminOffice.findUnique({ where: { userId_officeId: { userId, officeId } } });
    if (!assignment) throw new AppError(404, "OFFICE_ADMIN_NOT_FOUND", "Office administrator is not assigned to this office");

    return prisma.$transaction(async (tx) => {
      await tx.adminOffice.delete({ where: { userId_officeId: { userId, officeId } } });
      await syncOfficeAdminTenantState(userId, organizationId, tx);
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "OFFICE_ADMIN_UNASSIGNED",
          entityType: "User",
          entityId: userId,
          oldValues: { officeId, organizationId },
          newValues: { officeId: null },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return { userId, officeId };
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
