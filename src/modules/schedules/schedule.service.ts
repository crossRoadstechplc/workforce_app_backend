import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { assertSameOrganization } from "../../shared/tenancy.js";
import type { ScheduleDayInput, ScheduleInput } from "./schedule.schemas.js";

const dayInclude = { days: { orderBy: { weekday: "asc" as const } } };

function normalizeDays(days: ScheduleDayInput[]) {
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  return {
    days: sorted,
    workingDays: sorted.map((d) => d.weekday),
    checkInTime: sorted[0]!.checkInTime,
    checkOutTime: sorted[0]!.checkOutTime
  };
}

export const scheduleService = {
  async create(organizationId: string, input: ScheduleInput, audit: AuditContext) {
    const normalized = normalizeDays(input.days);
    return prisma.$transaction(async (tx) => {
      const schedule = await tx.workSchedule.create({
        data: {
          organizationId,
          name: input.name,
          lateGraceMinutes: input.lateGraceMinutes,
          timezone: input.timezone,
          checkInTime: normalized.checkInTime,
          checkOutTime: normalized.checkOutTime,
          workingDays: normalized.workingDays,
          days: {
            create: normalized.days.map((d) => ({
              weekday: d.weekday,
              checkInTime: d.checkInTime,
              checkOutTime: d.checkOutTime
            }))
          }
        },
        include: dayInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "SCHEDULE_CREATED",
          entityType: "WorkSchedule",
          entityId: schedule.id,
          newValues: auditJson(schedule),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return schedule;
    });
  },

  async list(organizationId: string, input: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const where = {
      organizationId,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.search ? { name: { contains: input.search, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.workSchedule.findMany({
        where,
        orderBy: { name: "asc" },
        ...pagination(input),
        include: { ...dayInclude, _count: { select: { employees: true } } }
      }),
      prisma.workSchedule.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async get(organizationId: string, scheduleId: string) {
    const schedule = await prisma.workSchedule.findUnique({
      where: { id: scheduleId },
      include: { ...dayInclude, _count: { select: { employees: true } } }
    });
    if (!schedule) throw new AppError(404, "SCHEDULE_NOT_FOUND", "Work schedule not found");
    assertSameOrganization(schedule.organizationId, organizationId, "SCHEDULE_NOT_FOUND", "Work schedule not found");
    return schedule;
  },

  async update(organizationId: string, scheduleId: string, input: Partial<ScheduleInput>, audit: AuditContext) {
    const current = await this.get(organizationId, scheduleId);
    return prisma.$transaction(async (tx) => {
      let dayData: ReturnType<typeof normalizeDays> | undefined;
      if (input.days) dayData = normalizeDays(input.days);

      if (dayData) {
        await tx.workScheduleDay.deleteMany({ where: { scheduleId } });
        await tx.workScheduleDay.createMany({
          data: dayData.days.map((d) => ({
            scheduleId,
            weekday: d.weekday,
            checkInTime: d.checkInTime,
            checkOutTime: d.checkOutTime
          }))
        });
      }

      const updated = await tx.workSchedule.update({
        where: { id: scheduleId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.lateGraceMinutes !== undefined ? { lateGraceMinutes: input.lateGraceMinutes } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(dayData
            ? {
                checkInTime: dayData.checkInTime,
                checkOutTime: dayData.checkOutTime,
                workingDays: dayData.workingDays
              }
            : {})
        },
        include: dayInclude
      });

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "SCHEDULE_UPDATED",
          entityType: "WorkSchedule",
          entityId: scheduleId,
          oldValues: auditJson(current),
          newValues: auditJson(updated),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return updated;
    });
  },

  async changeStatus(organizationId: string, scheduleId: string, input: { isActive: boolean; reason: string }, audit: AuditContext) {
    const current = await this.get(organizationId, scheduleId);
    if (!input.isActive && current._count.employees > 0) {
      throw new AppError(409, "SCHEDULE_HAS_EMPLOYEES", "Reassign employees before deactivating this schedule", {
        employeeCount: current._count.employees
      });
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.workSchedule.update({
        where: { id: scheduleId },
        data: { isActive: input.isActive },
        include: dayInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "SCHEDULE_STATUS_CHANGED",
          entityType: "WorkSchedule",
          entityId: scheduleId,
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
