import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { generateEmployeeCode } from "../../shared/employee-code.js";
import { generateTemporaryPassword } from "../../shared/password.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { assertSameOrganization } from "../../shared/tenancy.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";

const employeeInclude = {
  user: { select: { id: true, email: true, status: true, mustChangePassword: true, lastLoginAt: true } },
  office: true,
  schedule: { include: { days: { orderBy: { weekday: "asc" as const } } } }
} as const;

type CreateEmployeeInput = {
  email: string;
  employeeCode?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  employmentStartDate: Date;
  officeId?: string | null;
  scheduleId?: string | null;
  temporaryPassword?: string;
};

type ListInput = {
  page: number;
  pageSize: number;
  search?: string;
  status?: "ACTIVE" | "INACTIVE" | "TERMINATED";
  officeId?: string;
  scheduleId?: string;
  department?: string;
};

async function validateAssignments(organizationId: string, officeId?: string | null, scheduleId?: string | null) {
  const [office, schedule] = await Promise.all([
    officeId ? prisma.office.findUnique({ where: { id: officeId } }) : null,
    scheduleId ? prisma.workSchedule.findUnique({ where: { id: scheduleId } }) : null
  ]);
  if (officeId && (!office || !office.isActive || office.organizationId !== organizationId)) {
    throw new AppError(400, "INVALID_OFFICE", "Office does not exist or is inactive");
  }
  if (scheduleId && (!schedule || !schedule.isActive || schedule.organizationId !== organizationId)) {
    throw new AppError(400, "INVALID_SCHEDULE", "Schedule does not exist or is inactive");
  }
}

export const employeeService = {
  async create(organizationId: string, input: CreateEmployeeInput, audit: AuditContext, scope: OfficeScope) {
    assertOfficeInScope(scope, input.officeId ?? undefined, "You can only assign employees to offices you manage");
    await validateAssignments(organizationId, input.officeId, input.scheduleId);
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const employee = await prisma.$transaction(async (tx) => {
      const employeeRole = await tx.role.findUnique({ where: { name: "EMPLOYEE" } });
      if (!employeeRole) throw new AppError(500, "ROLE_NOT_CONFIGURED", "EMPLOYEE role is not configured");

      const employeeCode = input.employeeCode ?? (await generateEmployeeCode(tx, organizationId));

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          mustChangePassword: true,
          userRoles: { create: { roleId: employeeRole.id } },
          memberships: { create: { organizationId } },
          employee: {
            create: {
              organizationId,
              employeeCode,
              firstName: input.firstName,
              middleName: input.middleName,
              lastName: input.lastName,
              phone: input.phone,
              jobTitle: input.jobTitle,
              department: input.department,
              employmentStartDate: input.employmentStartDate,
              officeId: input.officeId,
              scheduleId: input.scheduleId
            }
          }
        },
        include: { employee: { include: employeeInclude }, userRoles: { include: { role: true } } }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EMPLOYEE_CREATED",
          entityType: "Employee",
          entityId: user.employee!.id,
          newValues: {
            email: user.email,
            employeeCode: user.employee!.employeeCode,
            organizationId,
            officeId: user.employee!.officeId,
            scheduleId: user.employee!.scheduleId,
            status: user.employee!.status
          },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return user.employee!;
    });

    return { employee, temporaryPassword };
  },

  async list(organizationId: string, input: ListInput, scope: OfficeScope) {
    const where = {
      organizationId,
      ...employeeOfficeFilter(scope, input.officeId),
      ...(input.status ? { status: input.status } : {}),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.department ? { department: { equals: input.department, mode: "insensitive" as const } } : {}),
      ...(input.search
        ? {
            OR: [
              { employeeCode: { contains: input.search, mode: "insensitive" as const } },
              { firstName: { contains: input.search, mode: "insensitive" as const } },
              { middleName: { contains: input.search, mode: "insensitive" as const } },
              { lastName: { contains: input.search, mode: "insensitive" as const } },
              { user: { email: { contains: input.search, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.employee.findMany({ where, include: employeeInclude, orderBy: [{ createdAt: "desc" }], ...pagination(input) }),
      prisma.employee.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async get(organizationId: string, employeeId: string, scope: OfficeScope) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: employeeInclude });
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
    assertSameOrganization(employee.organizationId, organizationId, "EMPLOYEE_NOT_FOUND", "Employee not found");
    assertOfficeInScope(scope, employee.officeId, "You do not manage this employee's office");
    return employee;
  },

  async update(
    organizationId: string,
    employeeId: string,
    input: {
      email?: string;
      employeeCode?: string;
      firstName?: string;
      middleName?: string | null;
      lastName?: string;
      phone?: string | null;
      jobTitle?: string | null;
      department?: string | null;
      employmentStartDate?: Date;
      officeId?: string | null;
      scheduleId?: string | null;
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    const current = await this.get(organizationId, employeeId, scope);
    if (input.officeId !== undefined) assertOfficeInScope(scope, input.officeId, "You can only assign employees to offices you manage");
    await validateAssignments(organizationId, input.officeId, input.scheduleId);

    return prisma.$transaction(async (tx) => {
      if (input.email && input.email !== current.user.email) {
        await tx.user.update({ where: { id: current.userId }, data: { email: input.email as string } });
      }
      const { email: _email, ...employeeData } = input;
      const updated = await tx.employee.update({ where: { id: employeeId }, data: employeeData, include: employeeInclude });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EMPLOYEE_UPDATED",
          entityType: "Employee",
          entityId: employeeId,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  },

  async changeStatus(
    organizationId: string,
    employeeId: string,
    input: { employeeStatus: "ACTIVE" | "INACTIVE" | "TERMINATED"; userStatus?: "ACTIVE" | "INACTIVE"; reason: string },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    const current = await this.get(organizationId, employeeId, scope);
    const desiredUserStatus = input.userStatus ?? (input.employeeStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE");
    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({ where: { id: employeeId }, data: { status: input.employeeStatus }, include: employeeInclude });
      await tx.user.update({ where: { id: current.userId }, data: { status: desiredUserStatus } });
      if (desiredUserStatus !== "ACTIVE") {
        await tx.refreshToken.updateMany({ where: { userId: current.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EMPLOYEE_STATUS_CHANGED",
          entityType: "Employee",
          entityId: employeeId,
          oldValues: { employeeStatus: current.status, userStatus: current.user.status },
          newValues: { employeeStatus: input.employeeStatus, userStatus: desiredUserStatus },
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return employee;
    });
  },

  async resetPassword(organizationId: string, employeeId: string, input: { temporaryPassword?: string; reason: string }, audit: AuditContext, scope: OfficeScope) {
    const employee = await this.get(organizationId, employeeId, scope);
    const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: employee.userId }, data: { passwordHash, mustChangePassword: true, status: "ACTIVE" } });
      await tx.refreshToken.updateMany({ where: { userId: employee.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EMPLOYEE_TEMPORARY_PASSWORD_RESET",
          entityType: "Employee",
          entityId: employeeId,
          oldValues: { mustChangePassword: employee.user.mustChangePassword },
          newValues: { mustChangePassword: true, sessionsRevoked: true },
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    });
    return { employeeId, temporaryPassword, mustChangePassword: true };
  }
};
