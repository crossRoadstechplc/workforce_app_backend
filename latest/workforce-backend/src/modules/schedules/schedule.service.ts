import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";

type ScheduleInput = {
  name: string;
  checkInTime: string;
  checkOutTime: string;
  lateGraceMinutes: number;
  workingDays: number[];
  timezone: string;
};

export const scheduleService = {
  async create(input: ScheduleInput, audit: AuditContext) {
    return prisma.$transaction(async (tx) => {
      const schedule = await tx.workSchedule.create({ data: input });
      await tx.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "SCHEDULE_CREATED", entityType: "WorkSchedule", entityId: schedule.id, newValues: auditJson(schedule), ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
      return schedule;
    });
  },
  async list(input: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const where = {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.search ? { name: { contains: input.search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.workSchedule.findMany({ where, orderBy: { name: "asc" }, ...pagination(input), include: { _count: { select: { employees: true } } } }),
      prisma.workSchedule.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },
  async get(scheduleId: string) {
    const schedule = await prisma.workSchedule.findUnique({ where: { id: scheduleId }, include: { _count: { select: { employees: true } } } });
    if (!schedule) throw new AppError(404, "SCHEDULE_NOT_FOUND", "Work schedule not found");
    return schedule;
  },
  async update(scheduleId: string, input: Partial<ScheduleInput>, audit: AuditContext) {
    const current = await this.get(scheduleId);
    const merged = { ...current, ...input };
    if (merged.checkOutTime <= merged.checkInTime) throw new AppError(400, "INVALID_SCHEDULE_TIME", "Checkout time must be after check-in time");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.workSchedule.update({ where: { id: scheduleId }, data: input });
      await tx.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "SCHEDULE_UPDATED", entityType: "WorkSchedule", entityId: scheduleId, oldValues: auditJson(current), newValues: auditJson(updated), ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
      return updated;
    });
  },
  async changeStatus(scheduleId: string, input: { isActive: boolean; reason: string }, audit: AuditContext) {
    const current = await this.get(scheduleId);
    if (!input.isActive && current._count.employees > 0) {
      throw new AppError(409, "SCHEDULE_HAS_EMPLOYEES", "Reassign employees before deactivating this schedule", { employeeCount: current._count.employees });
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.workSchedule.update({ where: { id: scheduleId }, data: { isActive: input.isActive } });
      await tx.auditLog.create({ data: { actorUserId: audit.actorUserId, action: "SCHEDULE_STATUS_CHANGED", entityType: "WorkSchedule", entityId: scheduleId, oldValues: { isActive: current.isActive }, newValues: { isActive: input.isActive }, reason: input.reason, ipAddress: audit.ipAddress, userAgent: audit.userAgent } });
      return updated;
    });
  }
};
