import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { generateEmployeeCode } from "../../shared/employee-code.js";
import { generateMemorableTemporaryPassword } from "../../shared/password.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { assertSameOrganization } from "../../shared/tenancy.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";
import { supervisorPortalAccess, validateSupervisor } from "../performance/performance.service.js";
import {
  assertCanBecomeEmployee,
  assertNotPlatformAdmin,
  ensureOrgMembership,
  ensureRole,
  findUserByEmail,
  normalizeEmail
} from "../users/user-provision.service.js";

const supervisorSelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  jobTitle: true,
  userId: true,
  user: { select: { id: true, email: true, status: true, userRoles: { include: { role: true } } } }
} as const;

const employeeInclude = {
  user: { select: { id: true, email: true, status: true, mustChangePassword: true, lastLoginAt: true } },
  office: true,
  schedule: { include: { days: { orderBy: { weekday: "asc" as const } } } },
  department: { select: { id: true, name: true, isActive: true } },
  evaluationTemplate: { select: { id: true, name: true, isActive: true } },
  supervisor: { select: supervisorSelect }
} as const;

function withSupervisorAccess<T extends { supervisor?: { user: { userRoles: Array<{ role: { name: string } }> } } | null }>(employee: T) {
  return { ...employee, supervisorHasPortalAccess: supervisorPortalAccess(employee.supervisor) };
}

type CreateEmployeeInput = {
  email: string;
  employeeCode?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phone?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  evaluationTemplateId?: string | null;
  employmentStartDate: Date;
  officeId?: string | null;
  scheduleId?: string | null;
  supervisorId?: string | null;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
};

type ListInput = {
  page: number;
  pageSize: number;
  search?: string;
  status?: "ACTIVE" | "INACTIVE" | "TERMINATED";
  officeId?: string;
  scheduleId?: string;
  departmentId?: string;
};

async function validateAssignments(
  organizationId: string,
  input: { officeId?: string | null; scheduleId?: string | null; departmentId?: string | null; evaluationTemplateId?: string | null }
) {
  const [office, schedule, department, evaluationTemplate] = await Promise.all([
    input.officeId ? prisma.office.findUnique({ where: { id: input.officeId } }) : null,
    input.scheduleId ? prisma.workSchedule.findUnique({ where: { id: input.scheduleId } }) : null,
    input.departmentId ? prisma.department.findUnique({ where: { id: input.departmentId } }) : null,
    input.evaluationTemplateId ? prisma.evaluationTemplate.findUnique({ where: { id: input.evaluationTemplateId } }) : null
  ]);
  if (input.officeId && (!office || !office.isActive || office.organizationId !== organizationId)) {
    throw new AppError(400, "INVALID_OFFICE", "Office does not exist or is inactive");
  }
  if (input.scheduleId && (!schedule || !schedule.isActive || schedule.organizationId !== organizationId)) {
    throw new AppError(400, "INVALID_SCHEDULE", "Schedule does not exist or is inactive");
  }
  if (input.departmentId && (!department || !department.isActive || department.organizationId !== organizationId)) {
    throw new AppError(400, "INVALID_DEPARTMENT", "Department does not exist or is inactive");
  }
  if (input.evaluationTemplateId && (!evaluationTemplate || !evaluationTemplate.isActive || evaluationTemplate.organizationId !== organizationId)) {
    throw new AppError(400, "INVALID_EVALUATION_TEMPLATE", "Evaluation template does not exist or is inactive");
  }
}

const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;

async function resolveEmployeeCode(organizationId: string, provided?: string) {
  if (provided) return provided;
  return prisma.$transaction((tx) => generateEmployeeCode(tx, organizationId), TX_OPTIONS);
}

export const employeeService = {
  async create(organizationId: string, input: CreateEmployeeInput, audit: AuditContext, scope: OfficeScope) {
    assertOfficeInScope(scope, input.officeId ?? undefined, "You can only assign employees to offices you manage");
    await validateAssignments(organizationId, {
      officeId: input.officeId,
      scheduleId: input.scheduleId,
      departmentId: input.departmentId,
      evaluationTemplateId: input.evaluationTemplateId
    });
    await validateSupervisor(organizationId, null, input.supervisorId);

    const normalizedEmail = normalizeEmail(input.email);
    const employeeCode = await resolveEmployeeCode(organizationId, input.employeeCode);
    const existingPreview = await findUserByEmail(normalizedEmail);

    let preparedPassword: { hash: string; temporaryPassword: string } | undefined;
    if (existingPreview) {
      if (input.temporaryPassword) {
        preparedPassword = {
          temporaryPassword: input.temporaryPassword,
          hash: await argon2.hash(input.temporaryPassword, { type: argon2.argon2id })
        };
      }
    } else {
      const temporaryPassword = input.temporaryPassword ?? generateMemorableTemporaryPassword(employeeCode);
      preparedPassword = {
        temporaryPassword,
        hash: await argon2.hash(temporaryPassword, { type: argon2.argon2id })
      };
    }

    const created = await prisma.$transaction(async (tx) => {
      const existing = await findUserByEmail(normalizedEmail, tx);

      if (existing) {
        assertNotPlatformAdmin(existing);
        await assertCanBecomeEmployee(existing.id, organizationId, tx);
        await ensureRole(existing.id, "EMPLOYEE", tx);
        await ensureOrgMembership(existing.id, organizationId, tx);

        const employee = await tx.employee.create({
          data: {
            organizationId,
            userId: existing.id,
            employeeCode,
            firstName: input.firstName,
            middleName: input.middleName,
            lastName: input.lastName,
            phone: input.phone,
            jobTitle: input.jobTitle,
            departmentId: input.departmentId,
            evaluationTemplateId: input.evaluationTemplateId,
            employmentStartDate: input.employmentStartDate,
            officeId: input.officeId,
            scheduleId: input.scheduleId,
            supervisorId: input.supervisorId
          }
        });

        if (preparedPassword) {
          await tx.user.update({
            where: { id: existing.id },
            data: {
              passwordHash: preparedPassword.hash,
              ...(input.mustChangePassword !== undefined ? { mustChangePassword: input.mustChangePassword } : {})
            }
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId: audit.actorUserId,
            action: "EMPLOYEE_CREATED",
            entityType: "Employee",
            entityId: employee.id,
            newValues: {
              email: existing.email,
              employeeCode: employee.employeeCode,
              organizationId,
              officeId: employee.officeId,
              scheduleId: employee.scheduleId,
              status: employee.status,
              attachedToExistingUser: true
            },
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent
          }
        });

        return {
          employeeId: employee.id,
          temporaryPassword: preparedPassword?.temporaryPassword,
          existingAccount: true as const
        };
      }

      const employeeRole = await tx.role.findUnique({ where: { name: "EMPLOYEE" } });
      if (!employeeRole) throw new AppError(500, "ROLE_NOT_CONFIGURED", "EMPLOYEE role is not configured");
      if (!preparedPassword) throw new AppError(500, "PASSWORD_NOT_PREPARED", "Temporary password was not prepared");

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: preparedPassword.hash,
          mustChangePassword: input.mustChangePassword ?? true,
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
              departmentId: input.departmentId,
              evaluationTemplateId: input.evaluationTemplateId,
              employmentStartDate: input.employmentStartDate,
              officeId: input.officeId,
              scheduleId: input.scheduleId,
              supervisorId: input.supervisorId
            }
          }
        },
        select: { id: true, email: true, employee: { select: { id: true, employeeCode: true, officeId: true, scheduleId: true, status: true } } }
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
      return { employeeId: user.employee!.id, temporaryPassword: preparedPassword.temporaryPassword, existingAccount: false as const };
    }, TX_OPTIONS);

    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: created.employeeId },
      include: employeeInclude
    });

    return {
      employee: withSupervisorAccess(employee),
      temporaryPassword: created.temporaryPassword,
      existingAccount: created.existingAccount
    };
  },

  async list(organizationId: string, input: ListInput, scope: OfficeScope) {
    const where = {
      organizationId,
      ...employeeOfficeFilter(scope, input.officeId),
      ...(input.status ? { status: input.status } : {}),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
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
    return { items: items.map(withSupervisorAccess), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async get(organizationId: string, employeeId: string, scope: OfficeScope) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: employeeInclude });
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
    assertSameOrganization(employee.organizationId, organizationId, "EMPLOYEE_NOT_FOUND", "Employee not found");
    assertOfficeInScope(scope, employee.officeId, "You do not manage this employee's office");
    return withSupervisorAccess(employee);
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
      departmentId?: string | null;
      evaluationTemplateId?: string | null;
      employmentStartDate?: Date;
      officeId?: string | null;
      scheduleId?: string | null;
      supervisorId?: string | null;
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    const current = await this.get(organizationId, employeeId, scope);
    if (input.officeId !== undefined) assertOfficeInScope(scope, input.officeId, "You can only assign employees to offices you manage");
    await validateAssignments(organizationId, {
      officeId: input.officeId,
      scheduleId: input.scheduleId,
      departmentId: input.departmentId,
      evaluationTemplateId: input.evaluationTemplateId
    });
    if (input.supervisorId !== undefined) await validateSupervisor(organizationId, employeeId, input.supervisorId);

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
      return withSupervisorAccess(updated);
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
      return withSupervisorAccess(employee);
    });
  },

  async resetPassword(organizationId: string, employeeId: string, input: { temporaryPassword?: string; reason: string }, audit: AuditContext, scope: OfficeScope) {
    const employee = await this.get(organizationId, employeeId, scope);
    const temporaryPassword = input.temporaryPassword ?? generateMemorableTemporaryPassword(employee.employeeCode);
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
