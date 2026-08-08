import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";

type OfficeInput = {
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  maximumAccuracyMeters: number;
  timezone: string;
};

export const officeService = {
  async create(input: OfficeInput, audit: AuditContext) {
    return prisma.$transaction(async (tx) => {
      const office = await tx.office.create({ data: input });
      await tx.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "OFFICE_CREATED", entityType: "Office", entityId: office.id, newValues: auditJson(office), ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
      return office;
    });
  },
  async list(input: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const where = {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.search ? { OR: [{ name: { contains: input.search, mode: "insensitive" as const } }, { address: { contains: input.search, mode: "insensitive" as const } }] } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.office.findMany({ where, orderBy: { name: "asc" }, ...pagination(input), include: { _count: { select: { employees: true } } } }),
      prisma.office.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },
  async get(officeId: string) {
    const office = await prisma.office.findUnique({ where: { id: officeId }, include: { _count: { select: { employees: true } } } });
    if (!office) throw new AppError(404, "OFFICE_NOT_FOUND", "Office not found");
    return office;
  },
  async update(officeId: string, input: Partial<OfficeInput>, audit: AuditContext) {
    const current = await this.get(officeId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.office.update({ where: { id: officeId }, data: input });
      await tx.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "OFFICE_UPDATED", entityType: "Office", entityId: officeId, oldValues: auditJson(current), newValues: auditJson(updated), ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
      return updated;
    });
  },
  async changeStatus(officeId: string, input: { isActive: boolean; reason: string }, audit: AuditContext) {
    const current = await this.get(officeId);
    if (!input.isActive && current._count.employees > 0) {
      throw new AppError(409, "OFFICE_HAS_EMPLOYEES", "Reassign employees before deactivating this office", { employeeCount: current._count.employees });
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.office.update({ where: { id: officeId }, data: { isActive: input.isActive } });
      await tx.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "OFFICE_STATUS_CHANGED", entityType: "Office", entityId: officeId, oldValues: { isActive: current.isActive }, newValues: { isActive: input.isActive }, reason: input.reason, ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
      return updated;
    });
  }
};
