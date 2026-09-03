import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { assertSameOrganization } from "../../shared/tenancy.js";

type DepartmentInput = { name: string };

export const departmentService = {
  async create(organizationId: string, input: DepartmentInput, audit: AuditContext) {
    return prisma.$transaction(async (tx) => {
      const department = await tx.department.create({ data: { ...input, organizationId } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "DEPARTMENT_CREATED",
          entityType: "Department",
          entityId: department.id,
          newValues: auditJson(department),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return department;
    });
  },

  async list(organizationId: string, input: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const where = {
      organizationId,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.search ? { name: { contains: input.search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.department.findMany({
        where,
        orderBy: { name: "asc" },
        ...pagination(input),
        include: { _count: { select: { employees: true } } }
      }),
      prisma.department.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async get(organizationId: string, departmentId: string) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { _count: { select: { employees: true } } }
    });
    if (!department) throw new AppError(404, "DEPARTMENT_NOT_FOUND", "Department not found");
    assertSameOrganization(department.organizationId, organizationId, "DEPARTMENT_NOT_FOUND", "Department not found");
    return department;
  },

  async update(organizationId: string, departmentId: string, input: Partial<DepartmentInput>, audit: AuditContext) {
    const current = await this.get(organizationId, departmentId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.department.update({ where: { id: departmentId }, data: input });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "DEPARTMENT_UPDATED",
          entityType: "Department",
          entityId: departmentId,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  },

  async changeStatus(organizationId: string, departmentId: string, input: { isActive: boolean; reason: string }, audit: AuditContext) {
    const current = await this.get(organizationId, departmentId);
    if (!input.isActive && current._count.employees > 0) {
      throw new AppError(409, "DEPARTMENT_HAS_EMPLOYEES", "Reassign employees before deactivating this department", {
        employeeCount: current._count.employees
      });
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.department.update({ where: { id: departmentId }, data: { isActive: input.isActive } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "DEPARTMENT_STATUS_CHANGED",
          entityType: "Department",
          entityId: departmentId,
          oldValues: { isActive: current.isActive },
          newValues: { isActive: input.isActive },
          reason: input.reason,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  }
};
