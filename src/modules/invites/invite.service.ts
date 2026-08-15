import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { Invite, InviteType, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { isOfficeAdmin, isOrgAdmin, isSuperAdmin, type AuthContext } from "../../shared/tenancy.js";
import { assertOfficeInScope, getOfficeScope, type OfficeScope } from "../../shared/office-scope.js";
import { employeeService } from "../employees/employee.service.js";
import { sendMail } from "../mail/mailer.js";
import { employeeInviteEmail, officeAdminInviteEmail, orgAdminInviteEmail } from "../mail/templates.js";

type Tx = Prisma.TransactionClient;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

function inviteExpiresAt() {
  return new Date(Date.now() + env.INVITE_TTL_HOURS * 3600_000);
}

function inviteUrl(type: InviteType, token: string) {
  const path = type === "EMPLOYEE" ? "/invite/employee" : "/invite/admin";
  return `${env.ADMIN_PORTAL_URL.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
}

const inviteInclude = {
  organization: { select: { id: true, name: true, slug: true, isActive: true } },
  office: { select: { id: true, name: true } },
  schedule: { select: { id: true, name: true } }
} as const;

async function assertNoExistingUser(email: string, tx: Tx | typeof prisma = prisma) {
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "EMAIL_EXISTS", "Email is already registered");
}

async function assertNoPendingInvite(organizationId: string, email: string, type: InviteType, tx: Tx | typeof prisma = prisma) {
  const pending = await tx.invite.findFirst({
    where: { organizationId, email, type, status: "PENDING" }
  });
  if (pending) throw new AppError(409, "INVITE_PENDING", "A pending invite already exists for this email");
}

export async function createInviteInTx(
  tx: Tx,
  input: {
    type: InviteType;
    email: string;
    organizationId: string;
    invitedByUserId: string;
    userId?: string | null;
    officeIds?: string[];
    officeId?: string | null;
    scheduleId?: string | null;
    payload?: Prisma.InputJsonValue;
  }
) {
  await assertNoPendingInvite(input.organizationId, input.email, input.type, tx);
  if (input.type === "EMPLOYEE") await assertNoExistingUser(input.email, tx);
  const token = createInviteToken();
  const invite = await tx.invite.create({
    data: {
      type: input.type,
      email: input.email,
      organizationId: input.organizationId,
      invitedByUserId: input.invitedByUserId,
      userId: input.userId ?? null,
      officeIds: input.officeIds ?? [],
      officeId: input.officeId ?? null,
      scheduleId: input.scheduleId ?? null,
      payload: input.payload ?? undefined,
      tokenHash: hashInviteToken(token),
      expiresAt: inviteExpiresAt()
    },
    include: inviteInclude
  });
  return { invite, token };
}

async function officeNamesFor(officeIds: string[]) {
  if (!officeIds.length) return "";
  const offices = await prisma.office.findMany({
    where: { id: { in: officeIds } },
    select: { name: true }
  });
  return offices.map((office) => office.name).join(", ");
}

export async function deliverInvite(invite: Invite & { organization: { name: string } }, token: string) {
  const href = inviteUrl(invite.type, token);
  try {
    if (invite.type === "ORG_ADMIN") {
      const mail = orgAdminInviteEmail({ companyName: invite.organization.name, href });
      await sendMail(invite.email, mail.subject, mail.html);
    } else if (invite.type === "OFFICE_ADMIN") {
      const mail = officeAdminInviteEmail({
        companyName: invite.organization.name,
        officeNames: (await officeNamesFor(invite.officeIds)) || "assigned offices",
        href
      });
      await sendMail(invite.email, mail.subject, mail.html);
    } else {
      const mail = employeeInviteEmail({ companyName: invite.organization.name, href });
      await sendMail(invite.email, mail.subject, mail.html);
    }
    return { emailSent: true as const };
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Could not send invite email";
    return { emailSent: false as const, emailError: message };
  }
}

async function loadUsableInvite(token: string) {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: inviteInclude
  });
  if (!invite) throw new AppError(404, "INVITE_NOT_FOUND", "Invite was not found");
  if (invite.status === "ACCEPTED") throw new AppError(410, "INVITE_USED", "This invite has already been used");
  if (invite.status === "CANCELLED") throw new AppError(410, "INVITE_CANCELLED", "This invite is no longer valid");
  if (invite.status === "EXPIRED" || invite.expiresAt <= new Date()) {
    if (invite.status === "PENDING") {
      await prisma.invite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    }
    throw new AppError(410, "INVITE_EXPIRED", "This invite has expired");
  }
  if (!invite.organization.isActive) throw new AppError(400, "ORG_INACTIVE", "Organization is inactive");
  return invite;
}

function publicPreview(invite: Awaited<ReturnType<typeof loadUsableInvite>>) {
  return {
    type: invite.type,
    email: invite.email,
    status: invite.status,
    expiresAt: invite.expiresAt,
    organization: invite.organization,
    office: invite.office,
    schedule: invite.schedule,
    offices: invite.officeIds,
    payload: invite.payload
  };
}

function assertCanManageInvite(auth: AuthContext, invite: { type: InviteType; organizationId: string; officeId: string | null }) {
  if (isSuperAdmin(auth)) return;
  if (!auth.organizationId || auth.organizationId !== invite.organizationId) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to manage this invite");
  }
  if (invite.type === "ORG_ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only platform administrators can manage company admin invites");
  }
  if (isOrgAdmin(auth)) return;
  if (isOfficeAdmin(auth) && invite.type === "EMPLOYEE") {
    assertOfficeInScope(getOfficeScope(auth), invite.officeId, "You do not manage this employee's office");
    return;
  }
  throw new AppError(403, "FORBIDDEN", "You do not have permission to manage this invite");
}

export const inviteService = {
  async getPublic(token: string) {
    return publicPreview(await loadUsableInvite(token));
  },

  async acceptAdmin(token: string, password: string) {
    const invite = await loadUsableInvite(token);
    if (invite.type !== "ORG_ADMIN" && invite.type !== "OFFICE_ADMIN") {
      throw new AppError(400, "INVITE_TYPE_MISMATCH", "This invite is not an administrator invite");
    }
    if (!invite.userId) throw new AppError(400, "INVITE_INCOMPLETE", "Invite is missing an account");
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: invite.userId! },
        data: { passwordHash, mustChangePassword: false, status: "ACTIVE" }
      });
      await tx.refreshToken.updateMany({ where: { userId: invite.userId!, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: invite.userId!,
          action: "INVITE_ACCEPTED",
          entityType: "Invite",
          entityId: invite.id,
          newValues: auditJson({ type: invite.type, email: invite.email })
        }
      });
    });
    return { email: invite.email, type: invite.type, organization: invite.organization };
  },

  async acceptEmployee(token: string, input: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    phone?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    employmentStartDate: Date;
    employeeCode?: string;
    officeId?: string | null;
    scheduleId?: string | null;
    password: string;
  }) {
    const invite = await loadUsableInvite(token);
    if (invite.type !== "EMPLOYEE") throw new AppError(400, "INVITE_TYPE_MISMATCH", "This invite is not an employee invite");

    const payload = (invite.payload ?? {}) as {
      employmentStartDate?: string;
      jobTitle?: string | null;
      department?: string | null;
    };
    const officeId = invite.officeId ?? input.officeId ?? null;
    const scheduleId = invite.scheduleId ?? input.scheduleId ?? null;
    if (invite.officeId && input.officeId && input.officeId !== invite.officeId) {
      throw new AppError(400, "OFFICE_LOCKED", "Office was already assigned by your administrator");
    }
    if (invite.scheduleId && input.scheduleId && input.scheduleId !== invite.scheduleId) {
      throw new AppError(400, "SCHEDULE_LOCKED", "Schedule was already assigned by your administrator");
    }

    const created = await employeeService.create(
      invite.organizationId,
      {
        email: invite.email,
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        phone: input.phone,
        jobTitle: input.jobTitle ?? payload.jobTitle,
        department: input.department ?? payload.department,
        employmentStartDate: input.employmentStartDate,
        officeId,
        scheduleId,
        temporaryPassword: input.password,
        mustChangePassword: false
      },
      { actorUserId: invite.invitedByUserId },
      { allOffices: true, officeIds: [] }
    );

    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), userId: created.employee.userId }
    });

    return {
      email: invite.email,
      employeeCode: created.employee.employeeCode,
      organization: invite.organization
    };
  },

  async createEmployeeInvite(
    organizationId: string,
    input: {
      email: string;
      officeId?: string | null;
      scheduleId?: string | null;
      employmentStartDate?: Date;
      jobTitle?: string | null;
      department?: string | null;
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    assertOfficeInScope(scope, input.officeId ?? undefined, "You can only invite employees to offices you manage");
    if (input.officeId) {
      const office = await prisma.office.findUnique({ where: { id: input.officeId } });
      if (!office || !office.isActive || office.organizationId !== organizationId) {
        throw new AppError(400, "INVALID_OFFICE", "Office does not exist or is inactive");
      }
    }
    if (input.scheduleId) {
      const schedule = await prisma.workSchedule.findUnique({ where: { id: input.scheduleId } });
      if (!schedule || !schedule.isActive || schedule.organizationId !== organizationId) {
        throw new AppError(400, "INVALID_SCHEDULE", "Schedule does not exist or is inactive");
      }
    }

    const { invite, token } = await prisma.$transaction((tx) =>
      createInviteInTx(tx, {
        type: "EMPLOYEE",
        email: input.email,
        organizationId,
        invitedByUserId: audit.actorUserId,
        officeId: input.officeId,
        scheduleId: input.scheduleId,
        payload: {
          ...(input.employmentStartDate ? { employmentStartDate: input.employmentStartDate.toISOString().slice(0, 10) } : {}),
          ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
          ...(input.department ? { department: input.department } : {})
        }
      })
    );

    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "EMPLOYEE_INVITED",
        entityType: "Invite",
        entityId: invite.id,
        newValues: auditJson({ email: invite.email, organizationId, officeId: invite.officeId }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });

    const delivery = await deliverInvite(invite, token);
    return { invite, inviteId: invite.id, ...delivery };
  },

  async list(auth: AuthContext, input: { page: number; pageSize: number; type?: InviteType; status?: Invite["status"]; organizationId?: string }) {
    let organizationId = auth.organizationId;
    if (isSuperAdmin(auth)) organizationId = input.organizationId ?? null;
    else if (input.organizationId && input.organizationId !== auth.organizationId) {
      throw new AppError(403, "FORBIDDEN", "You can only list invites for your organization");
    }

    const scope = getOfficeScope(auth);
    const typeFilter: Prisma.InviteWhereInput =
      isSuperAdmin(auth)
        ? input.type
          ? { type: input.type }
          : {}
        : isOrgAdmin(auth)
          ? { type: input.type && input.type !== "ORG_ADMIN" ? input.type : { in: ["OFFICE_ADMIN", "EMPLOYEE"] } }
          : { type: "EMPLOYEE", officeId: { in: scope.officeIds } };

    const where: Prisma.InviteWhereInput = {
      ...(organizationId ? { organizationId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...typeFilter
    };

    const [items, total] = await prisma.$transaction([
      prisma.invite.findMany({
        where,
        include: inviteInclude,
        orderBy: { createdAt: "desc" },
        ...pagination(input)
      }),
      prisma.invite.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async resend(auth: AuthContext, inviteId: string) {
    const invite = await prisma.invite.findUnique({ where: { id: inviteId }, include: inviteInclude });
    if (!invite) throw new AppError(404, "INVITE_NOT_FOUND", "Invite was not found");
    assertCanManageInvite(auth, invite);
    if (invite.status !== "PENDING" && invite.status !== "EXPIRED") {
      throw new AppError(400, "INVITE_NOT_RESENDABLE", "Only pending or expired invites can be resent");
    }
    if (invite.type === "EMPLOYEE") await assertNoExistingUser(invite.email);

    const token = createInviteToken();
    const updated = await prisma.invite.update({
      where: { id: invite.id },
      data: {
        status: "PENDING",
        tokenHash: hashInviteToken(token),
        expiresAt: inviteExpiresAt(),
        acceptedAt: null
      },
      include: inviteInclude
    });
    const delivery = await deliverInvite(updated, token);
    return { invite: updated, inviteId: updated.id, ...delivery };
  }
};
