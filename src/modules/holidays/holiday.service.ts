import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import {
  assertOfficeInScope,
  employeeOfficeFilter,
  type OfficeScope
} from "../../shared/office-scope.js";
import {
  currentEthiopianYear,
  getCatalogHoliday,
  listCatalogHolidays,
  workDateForCatalogHoliday,
  type CatalogHoliday
} from "../../shared/ethiopian-holidays.js";
import { formatWorkDateKey, todayWorkDateKey, workDateFromKey } from "../../shared/work-date.js";
import { deliverNotification } from "../notifications/notification.service.js";

const CUSTOM_KEY_PREFIX = "custom:";
const DEFAULT_TZ = "Africa/Addis_Ababa";

function filterToKenat(filter?: string): string | null {
  if (!filter || filter === "public") return "public";
  if (filter === "all" || filter === "custom") return null;
  return filter;
}

export function isCustomHolidayKey(key: string) {
  return key.startsWith(CUSTOM_KEY_PREFIX);
}

export function customHolidayKey(id: string) {
  return `${CUSTOM_KEY_PREFIX}${id}`;
}

function customHolidayIdFromKey(key: string) {
  return key.slice(CUSTOM_KEY_PREFIX.length);
}

function holidaySummary(h: {
  id: string;
  kenatKey: string | null;
  linkedKenatKey?: string | null;
  nameEn: string;
  nameAm: string | null;
  description: string | null;
  tags: string[];
  gregorianDate: Date;
  ethiopianYear: number | null;
  ethiopianMonth: number | null;
  ethiopianDay: number | null;
  source: string;
  autoApply?: boolean;
  autoNotify?: boolean;
  autoMessage?: string | null;
  autoAppliedAt?: Date | null;
}) {
  return {
    id: h.id,
    kenatKey: h.kenatKey,
    linkedKenatKey: h.linkedKenatKey ?? null,
    nameEn: h.nameEn,
    nameAm: h.nameAm,
    description: h.description,
    tags: h.tags,
    gregorianDate: formatWorkDateKey(h.gregorianDate),
    ethiopian: h.ethiopianYear
      ? { year: h.ethiopianYear, month: h.ethiopianMonth, day: h.ethiopianDay }
      : null,
    source: h.source,
    autoApply: h.autoApply ?? false,
    autoNotify: h.autoNotify ?? true,
    autoMessage: h.autoMessage ?? null,
    autoAppliedAt: h.autoAppliedAt ?? null
  };
}

function catalogItemFromOrgHoliday(
  h: {
    id: string;
    kenatKey: string | null;
    linkedKenatKey: string | null;
    nameEn: string;
    nameAm: string | null;
    description: string | null;
    tags: string[];
    gregorianDate: Date;
    ethiopianYear: number | null;
    ethiopianMonth: number | null;
    ethiopianDay: number | null;
    source: string;
    autoApply: boolean;
    autoAppliedAt: Date | null;
  },
  assignedEmployees: number
) {
  const gregorianDate = formatWorkDateKey(h.gregorianDate);
  const [y, m, d] = gregorianDate.split("-").map(Number);
  return {
    key: h.source === "CUSTOM" ? customHolidayKey(h.id) : (h.kenatKey ?? customHolidayKey(h.id)),
    nameAm: h.nameAm ?? "",
    nameEn: h.nameEn,
    description: h.description,
    tags: h.tags.length ? h.tags : h.source === "CUSTOM" ? ["custom"] : [],
    movable: false,
    ethiopian: h.ethiopianYear
      ? { year: h.ethiopianYear, month: h.ethiopianMonth ?? 1, day: h.ethiopianDay ?? 1 }
      : { year: 0, month: 0, day: 0 },
    gregorian: { year: y!, month: m!, day: d! },
    gregorianDate,
    applied: assignedEmployees > 0,
    assignedEmployees,
    holidayId: h.id,
    source: h.source,
    autoApply: h.autoApply,
    autoAppliedAt: h.autoAppliedAt,
    linkedKenatKey: h.linkedKenatKey
  };
}

async function appliedCountsForOrg(organizationId: string, kenatKeys: string[], year: number) {
  const catalog = listCatalogHolidays(year);
  const dates = catalog.filter((h) => kenatKeys.includes(h.key)).map((h) => workDateForCatalogHoliday(h));
  if (!dates.length) return new Map<string, { assignedEmployees: number; applications: number; holidayId: string; autoApply: boolean; autoAppliedAt: Date | null }>();

  const holidays = await prisma.organizationHoliday.findMany({
    where: {
      organizationId,
      kenatKey: { in: kenatKeys },
      gregorianDate: { in: dates }
    },
    include: {
      _count: { select: { assignments: true, applications: true } }
    }
  });

  const map = new Map<
    string,
    { assignedEmployees: number; applications: number; holidayId: string; autoApply: boolean; autoAppliedAt: Date | null }
  >();
  for (const row of holidays) {
    if (!row.kenatKey) continue;
    map.set(row.kenatKey, {
      assignedEmployees: row._count.assignments,
      applications: row._count.applications,
      holidayId: row.id,
      autoApply: row.autoApply,
      autoAppliedAt: row.autoAppliedAt
    });
  }
  return map;
}

async function scopedAssignmentCount(
  holidayId: string,
  scope: OfficeScope,
  total: number
) {
  if (scope.allOffices) return total;
  return prisma.holidayAssignment.count({
    where: { holidayId, employee: { ...employeeOfficeFilter(scope) } }
  });
}

type ApplyResolvedHoliday = {
  id?: string;
  kenatKey: string | null;
  nameEn: string;
  nameAm: string | null;
  description: string | null;
  tags: string[];
  workDate: Date;
  ethiopianYear: number | null;
  ethiopianMonth: number | null;
  ethiopianDay: number | null;
  source: "KENAT" | "CUSTOM";
  linkedKenatKey?: string | null;
  catalog?: CatalogHoliday;
};

async function resolveApplyTarget(
  organizationId: string,
  input: { kenatKey?: string; holidayId?: string; year?: number }
): Promise<ApplyResolvedHoliday> {
  if (input.holidayId) {
    const holiday = await prisma.organizationHoliday.findFirst({
      where: { id: input.holidayId, organizationId }
    });
    if (!holiday) throw new AppError(404, "HOLIDAY_NOT_FOUND", "Holiday not found");
    return {
      id: holiday.id,
      kenatKey: holiday.kenatKey,
      nameEn: holiday.nameEn,
      nameAm: holiday.nameAm,
      description: holiday.description,
      tags: holiday.tags,
      workDate: holiday.gregorianDate,
      ethiopianYear: holiday.ethiopianYear,
      ethiopianMonth: holiday.ethiopianMonth,
      ethiopianDay: holiday.ethiopianDay,
      source: holiday.source,
      linkedKenatKey: holiday.linkedKenatKey
    };
  }

  if (input.kenatKey && isCustomHolidayKey(input.kenatKey)) {
    return resolveApplyTarget(organizationId, {
      holidayId: customHolidayIdFromKey(input.kenatKey),
      year: input.year
    });
  }

  const ethYear = input.year ?? currentEthiopianYear();
  const catalog = getCatalogHoliday(input.kenatKey!, ethYear);
  if (!catalog) throw new AppError(404, "HOLIDAY_NOT_FOUND", "Holiday not found in catalog");
  return {
    kenatKey: catalog.key,
    nameEn: catalog.nameEn,
    nameAm: catalog.nameAm,
    description: catalog.description,
    tags: catalog.tags,
    workDate: workDateForCatalogHoliday(catalog),
    ethiopianYear: catalog.ethiopian.year,
    ethiopianMonth: catalog.ethiopian.month,
    ethiopianDay: catalog.ethiopian.day,
    source: "KENAT",
    catalog
  };
}

export type HolidayInfo = {
  id: string;
  kenatKey: string | null;
  nameEn: string;
  nameAm: string | null;
  tags: string[];
  gregorianDate: string;
};

export const holidayLookup = {
  async mapForEmployees(employeeIds: string[], workDate: Date) {
    if (!employeeIds.length) return new Map<string, HolidayInfo>();
    const rows = await prisma.holidayAssignment.findMany({
      where: { employeeId: { in: employeeIds }, workDate },
      include: {
        holiday: {
          select: {
            id: true,
            kenatKey: true,
            nameEn: true,
            nameAm: true,
            tags: true,
            gregorianDate: true
          }
        }
      }
    });
    const map = new Map<string, HolidayInfo>();
    for (const row of rows) {
      map.set(row.employeeId, {
        id: row.holiday.id,
        kenatKey: row.holiday.kenatKey,
        nameEn: row.holiday.nameEn,
        nameAm: row.holiday.nameAm,
        tags: row.holiday.tags,
        gregorianDate: formatWorkDateKey(row.holiday.gregorianDate)
      });
    }
    return map;
  },

  async forEmployee(employeeId: string, workDateKey: string) {
    const workDate = workDateFromKey(workDateKey);
    const row = await prisma.holidayAssignment.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
      include: {
        holiday: {
          select: {
            id: true,
            kenatKey: true,
            nameEn: true,
            nameAm: true,
            tags: true,
            gregorianDate: true
          }
        }
      }
    });
    if (!row) return null;
    return {
      id: row.holiday.id,
      kenatKey: row.holiday.kenatKey,
      nameEn: row.holiday.nameEn,
      nameAm: row.holiday.nameAm,
      tags: row.holiday.tags,
      gregorianDate: formatWorkDateKey(row.holiday.gregorianDate)
    } satisfies HolidayInfo;
  },

  async employeeHolidayDates(employeeIds: string[], from: Date, toExclusive: Date) {
    if (!employeeIds.length) return new Map<string, Set<string>>();
    const rows = await prisma.holidayAssignment.findMany({
      where: {
        employeeId: { in: employeeIds },
        workDate: { gte: from, lt: toExclusive }
      },
      select: { employeeId: true, workDate: true }
    });
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = map.get(row.employeeId) ?? new Set<string>();
      set.add(formatWorkDateKey(row.workDate));
      map.set(row.employeeId, set);
    }
    return map;
  }
};

export const holidayService = {
  async catalog(
    organizationId: string,
    input: { year?: number; filter?: string },
    scope: OfficeScope
  ) {
    const year = input.year ?? currentEthiopianYear();
    const filter = input.filter ?? "all";
    const includeKenat = filter !== "custom";
    const includeCustom = filter === "custom" || filter === "all";

    const items: Array<{
      key: string;
      nameAm: string;
      nameEn: string;
      description: string | null;
      tags: string[];
      movable: boolean;
      ethiopian: { year: number; month: number; day: number };
      gregorian: { year: number; month: number; day: number };
      gregorianDate: string;
      applied: boolean;
      assignedEmployees: number;
      holidayId: string | null;
      source: string;
      autoApply: boolean;
      autoAppliedAt: Date | null;
      linkedKenatKey: string | null;
    }> = [];

    if (includeKenat) {
      const kenatFilter = filterToKenat(filter);
      const catalogItems = listCatalogHolidays(year, { filter: kenatFilter });
      const applied = await appliedCountsForOrg(
        organizationId,
        catalogItems.map((i) => i.key),
        year
      );

      let scopedAssignmentCounts: Map<string, number> | null = null;
      if (!scope.allOffices) {
        const holidayIds = [...applied.values()].map((a) => a.holidayId);
        if (holidayIds.length) {
          const scoped = await prisma.holidayAssignment.groupBy({
            by: ["holidayId"],
            where: {
              holidayId: { in: holidayIds },
              employee: { ...employeeOfficeFilter(scope) }
            },
            _count: { _all: true }
          });
          scopedAssignmentCounts = new Map(scoped.map((s) => [s.holidayId, s._count._all]));
        }
      }

      for (const item of catalogItems) {
        const app = applied.get(item.key);
        const assignedEmployees = app
          ? scopedAssignmentCounts
            ? scopedAssignmentCounts.get(app.holidayId) ?? 0
            : app.assignedEmployees
          : 0;
        items.push({
          ...item,
          applied: assignedEmployees > 0,
          assignedEmployees,
          holidayId: app?.holidayId ?? null,
          source: "KENAT",
          autoApply: app?.autoApply ?? false,
          autoAppliedAt: app?.autoAppliedAt ?? null,
          linkedKenatKey: null
        });
      }
    }

    if (includeCustom) {
      const boundsCatalog = listCatalogHolidays(year);
      const boundDates = boundsCatalog.map((h) => h.gregorianDate).sort();
      const fromKey = boundDates[0] ?? `${year - 8}-09-01`;
      const toKey = boundDates[boundDates.length - 1] ?? `${year - 7}-09-12`;
      const customRows = await prisma.organizationHoliday.findMany({
        where: {
          organizationId,
          source: "CUSTOM",
          gregorianDate: {
            gte: workDateFromKey(fromKey),
            lte: workDateFromKey(toKey)
          }
        },
        include: { _count: { select: { assignments: true } } },
        orderBy: { gregorianDate: "asc" }
      });

      for (const row of customRows) {
        const assignedEmployees = await scopedAssignmentCount(row.id, scope, row._count.assignments);
        items.push(catalogItemFromOrgHoliday(row, assignedEmployees));
      }
    }

    items.sort((a, b) => a.gregorianDate.localeCompare(b.gregorianDate));
    return { year, items };
  },

  async detail(organizationId: string, key: string, year?: number, scope?: OfficeScope) {
    if (isCustomHolidayKey(key)) {
      const holiday = await prisma.organizationHoliday.findFirst({
        where: { id: customHolidayIdFromKey(key), organizationId, source: "CUSTOM" },
        include: {
          applications: {
            where: { status: "APPLIED" },
            orderBy: { appliedAt: "desc" },
            take: 10,
            include: {
              appliedBy: { select: { id: true, email: true } },
              targets: true,
              _count: { select: { assignments: true } }
            }
          },
          _count: { select: { assignments: true } }
        }
      });
      if (!holiday) throw new AppError(404, "HOLIDAY_NOT_FOUND", "Custom holiday not found");

      let assignedEmployees = holiday._count.assignments;
      if (scope && !scope.allOffices) {
        assignedEmployees = await scopedAssignmentCount(holiday.id, scope, assignedEmployees);
      }

      const item = catalogItemFromOrgHoliday(holiday, assignedEmployees);
      return {
        ...item,
        holiday: holidaySummary(holiday),
        applications: holiday.applications.map((a) => ({
          id: a.id,
          allOffices: a.allOffices,
          allEmployees: a.allEmployees,
          notifyEmployees: a.notifyEmployees,
          message: a.message,
          assignmentCount: a._count.assignments,
          notifiedCount: a.notifiedCount,
          appliedAt: a.appliedAt,
          appliedBy: a.appliedBy,
          targets: a.targets
        }))
      };
    }

    const ethYear = year ?? currentEthiopianYear();
    const catalog = getCatalogHoliday(key, ethYear);
    if (!catalog) throw new AppError(404, "HOLIDAY_NOT_FOUND", "Holiday not found in catalog");

    const workDate = workDateForCatalogHoliday(catalog);
    const holiday = await prisma.organizationHoliday.findFirst({
      where: { organizationId, kenatKey: key, gregorianDate: workDate },
      include: {
        applications: {
          where: { status: "APPLIED" },
          orderBy: { appliedAt: "desc" },
          take: 10,
          include: {
            appliedBy: { select: { id: true, email: true } },
            targets: true,
            _count: { select: { assignments: true } }
          }
        },
        _count: { select: { assignments: true } }
      }
    });

    let assignedEmployees = holiday?._count.assignments ?? 0;
    if (holiday && scope && !scope.allOffices) {
      assignedEmployees = await scopedAssignmentCount(holiday.id, scope, assignedEmployees);
    }

    return {
      ...catalog,
      applied: assignedEmployees > 0,
      assignedEmployees,
      holidayId: holiday?.id ?? null,
      source: "KENAT" as const,
      autoApply: holiday?.autoApply ?? false,
      autoAppliedAt: holiday?.autoAppliedAt ?? null,
      linkedKenatKey: holiday?.linkedKenatKey ?? null,
      holiday: holiday ? holidaySummary(holiday) : null,
      applications: (holiday?.applications ?? []).map((a) => ({
        id: a.id,
        allOffices: a.allOffices,
        allEmployees: a.allEmployees,
        notifyEmployees: a.notifyEmployees,
        message: a.message,
        assignmentCount: a._count.assignments,
        notifiedCount: a.notifiedCount,
        appliedAt: a.appliedAt,
        appliedBy: a.appliedBy,
        targets: a.targets
      }))
    };
  },

  async apply(
    organizationId: string,
    input: {
      kenatKey?: string;
      holidayId?: string;
      year?: number;
      officeId?: string | null;
      employeeIds?: string[];
      notify?: boolean;
      message?: string | null;
      markAutoApplied?: boolean;
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    const target = await resolveApplyTarget(organizationId, input);
    if (input.officeId) assertOfficeInScope(scope, input.officeId);

    const workDate = target.workDate;
    const officeFilter = input.officeId
      ? { officeId: input.officeId }
      : employeeOfficeFilter(scope);

    const employeeWhere = {
      organizationId,
      status: "ACTIVE" as const,
      ...officeFilter,
      ...(input.employeeIds?.length ? { id: { in: input.employeeIds } } : {})
    };

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true, userId: true, officeId: true, firstName: true, lastName: true }
    });

    if (!employees.length) {
      throw new AppError(422, "NO_EMPLOYEES", "No active employees match the selected scope");
    }

    if (input.employeeIds?.length) {
      const found = new Set(employees.map((e) => e.id));
      const missing = input.employeeIds.filter((id) => !found.has(id));
      if (missing.length) {
        throw new AppError(422, "EMPLOYEES_OUT_OF_SCOPE", "Some employees are outside your office scope");
      }
    }

    const alreadyAssigned = await prisma.holidayAssignment.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        workDate
      },
      select: { employeeId: true }
    });
    const alreadySet = new Set(alreadyAssigned.map((a) => a.employeeId));
    const toAssign = employees.filter((e) => !alreadySet.has(e.id));

    const existingTimesheets = await prisma.timesheet.findMany({
      where: {
        employeeId: { in: toAssign.map((e) => e.id) },
        workDate
      },
      select: { employeeId: true }
    });
    const checkedInCount = existingTimesheets.length;

    const notify = input.notify !== false;
    const message =
      input.message?.trim() ||
      `${target.nameEn} — no work on this day. Enjoy the holiday.`;

    const result = await prisma.$transaction(async (tx) => {
      let holiday;
      if (target.id) {
        holiday = await tx.organizationHoliday.update({
          where: { id: target.id },
          data: {
            ...(input.markAutoApplied ? { autoAppliedAt: new Date() } : {})
          }
        });
      } else {
        holiday = await tx.organizationHoliday.upsert({
          where: {
            organizationId_kenatKey_gregorianDate: {
              organizationId,
              kenatKey: target.kenatKey!,
              gregorianDate: workDate
            }
          },
          create: {
            organizationId,
            kenatKey: target.kenatKey,
            nameEn: target.nameEn,
            nameAm: target.nameAm,
            description: target.description,
            tags: target.tags,
            gregorianDate: workDate,
            ethiopianYear: target.ethiopianYear,
            ethiopianMonth: target.ethiopianMonth,
            ethiopianDay: target.ethiopianDay,
            source: target.source,
            ...(input.markAutoApplied ? { autoAppliedAt: new Date() } : {})
          },
          update: {
            nameEn: target.nameEn,
            nameAm: target.nameAm,
            description: target.description,
            tags: target.tags,
            ethiopianYear: target.ethiopianYear,
            ethiopianMonth: target.ethiopianMonth,
            ethiopianDay: target.ethiopianDay,
            ...(input.markAutoApplied ? { autoAppliedAt: new Date() } : {})
          }
        });
      }

      const application = await tx.holidayApplication.create({
        data: {
          organizationId,
          holidayId: holiday.id,
          appliedById: audit.actorUserId,
          allOffices: !input.officeId && scope.allOffices,
          allEmployees: !input.employeeIds?.length,
          notifyEmployees: notify,
          message,
          status: "APPLIED",
          assignmentCount: toAssign.length,
          notifiedCount: 0,
          targets: {
            create: [
              ...(input.officeId ? [{ officeId: input.officeId }] : []),
              ...(input.employeeIds?.map((employeeId) => ({ employeeId })) ?? [])
            ]
          }
        }
      });

      if (toAssign.length) {
        await tx.holidayAssignment.createMany({
          data: toAssign.map((e) => ({
            organizationId,
            holidayId: holiday.id,
            applicationId: application.id,
            employeeId: e.id,
            workDate
          })),
          skipDuplicates: true
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: input.markAutoApplied ? "HOLIDAY_AUTO_APPLIED" : "HOLIDAY_APPLIED",
          entityType: "OrganizationHoliday",
          entityId: holiday.id,
          newValues: auditJson({
            kenatKey: target.kenatKey,
            gregorianDate: formatWorkDateKey(workDate),
            assignmentCount: toAssign.length,
            skippedAlreadyAssigned: alreadySet.size,
            officeId: input.officeId ?? null,
            employeeIds: input.employeeIds ?? null,
            notify,
            auto: !!input.markAutoApplied
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });

      return { holiday, application };
    });

    let notifiedCount = 0;
    if (notify && toAssign.length) {
      for (const emp of toAssign) {
        const notification = await prisma.notification.create({
          data: {
            userId: emp.userId,
            type: "HOLIDAY_ANNOUNCED",
            title: target.nameEn,
            message,
            relatedEntityType: "OrganizationHoliday",
            relatedEntityId: result.holiday.id
          }
        });
        await deliverNotification(notification);
        notifiedCount += 1;
      }
      await prisma.holidayApplication.update({
        where: { id: result.application.id },
        data: { notifiedCount }
      });
    }

    return {
      holiday: holidaySummary(result.holiday),
      application: {
        id: result.application.id,
        assignmentCount: toAssign.length,
        notifiedCount,
        skippedAlreadyAssigned: alreadySet.size,
        alreadyCheckedIn: checkedInCount,
        totalTargeted: employees.length
      },
      catalog: target.catalog ?? {
        key: target.source === "CUSTOM" ? customHolidayKey(result.holiday.id) : (target.kenatKey ?? result.holiday.id),
        nameAm: target.nameAm ?? "",
        nameEn: target.nameEn,
        description: target.description,
        tags: target.tags,
        movable: false,
        ethiopian: {
          year: target.ethiopianYear ?? 0,
          month: target.ethiopianMonth ?? 0,
          day: target.ethiopianDay ?? 0
        },
        gregorian: (() => {
          const iso = formatWorkDateKey(workDate);
          const [y, m, d] = iso.split("-").map(Number);
          return { year: y!, month: m!, day: d! };
        })(),
        gregorianDate: formatWorkDateKey(workDate)
      }
    };
  },

  async createCustom(
    organizationId: string,
    input: {
      nameEn: string;
      nameAm?: string | null;
      description?: string | null;
      gregorianDates: string[];
      linkedKenatKey?: string | null;
      officeId?: string | null;
      employeeIds?: string[];
      notify?: boolean;
      message?: string | null;
      applyNow?: boolean;
      autoApply?: boolean;
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    if (input.officeId) assertOfficeInScope(scope, input.officeId);
    const uniqueDates = [...new Set(input.gregorianDates)].sort();
    if (!uniqueDates.length) {
      throw new AppError(422, "DATES_REQUIRED", "At least one date is required");
    }

    const created = [];
    for (const dateKey of uniqueDates) {
      const workDate = workDateFromKey(dateKey);
      const holiday = await prisma.organizationHoliday.create({
        data: {
          organizationId,
          kenatKey: null,
          linkedKenatKey: input.linkedKenatKey ?? null,
          nameEn: input.nameEn.trim(),
          nameAm: input.nameAm?.trim() || null,
          description: input.description?.trim() || null,
          tags: ["custom"],
          gregorianDate: workDate,
          source: "CUSTOM",
          autoApply: !!input.autoApply,
          autoNotify: input.notify !== false,
          autoMessage: input.message?.trim() || null,
          autoOfficeId: input.officeId ?? null,
          autoAllEmployees: !input.employeeIds?.length,
          autoEmployeeIds: input.employeeIds ?? [],
          autoEnabledById: input.autoApply ? audit.actorUserId : null
        }
      });
      created.push(holiday);

      await prisma.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "HOLIDAY_CUSTOM_CREATED",
          entityType: "OrganizationHoliday",
          entityId: holiday.id,
          newValues: auditJson({
            nameEn: holiday.nameEn,
            gregorianDate: dateKey,
            autoApply: holiday.autoApply,
            linkedKenatKey: holiday.linkedKenatKey
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    }

    const applications = [];
    if (input.applyNow !== false) {
      for (const holiday of created) {
        const result = await this.apply(
          organizationId,
          {
            holidayId: holiday.id,
            officeId: input.officeId,
            employeeIds: input.employeeIds,
            notify: input.notify,
            message: input.message,
            markAutoApplied: !!input.autoApply
          },
          audit,
          scope
        );
        applications.push(result);
      }
    } else if (input.autoApply) {
      // Future auto-apply: if date is today or past, apply now
      const today = todayWorkDateKey(DEFAULT_TZ);
      for (const holiday of created) {
        const dateKey = formatWorkDateKey(holiday.gregorianDate);
        if (dateKey <= today) {
          const result = await this.apply(
            organizationId,
            {
              holidayId: holiday.id,
              officeId: input.officeId,
              employeeIds: input.employeeIds,
              notify: input.notify,
              message: input.message,
              markAutoApplied: true
            },
            audit,
            scope
          );
          applications.push(result);
        }
      }
    }

    return {
      holidays: created.map((h) => holidaySummary(h)),
      applications: applications.map((a) => a.application)
    };
  },

  async setAutoApply(
    organizationId: string,
    input: {
      kenatKey?: string;
      holidayId?: string;
      year?: number;
      autoApply: boolean;
      notify?: boolean;
      message?: string | null;
      officeId?: string | null;
      employeeIds?: string[];
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    if (input.officeId) assertOfficeInScope(scope, input.officeId);

    let holiday;
    if (input.holidayId || (input.kenatKey && isCustomHolidayKey(input.kenatKey))) {
      const id = input.holidayId ?? customHolidayIdFromKey(input.kenatKey!);
      holiday = await prisma.organizationHoliday.findFirst({
        where: { id, organizationId }
      });
      if (!holiday) throw new AppError(404, "HOLIDAY_NOT_FOUND", "Holiday not found");
    } else {
      const target = await resolveApplyTarget(organizationId, {
        kenatKey: input.kenatKey,
        year: input.year
      });
      holiday = await prisma.organizationHoliday.upsert({
        where: {
          organizationId_kenatKey_gregorianDate: {
            organizationId,
            kenatKey: target.kenatKey!,
            gregorianDate: target.workDate
          }
        },
        create: {
          organizationId,
          kenatKey: target.kenatKey,
          nameEn: target.nameEn,
          nameAm: target.nameAm,
          description: target.description,
          tags: target.tags,
          gregorianDate: target.workDate,
          ethiopianYear: target.ethiopianYear,
          ethiopianMonth: target.ethiopianMonth,
          ethiopianDay: target.ethiopianDay,
          source: "KENAT"
        },
        update: {
          nameEn: target.nameEn,
          nameAm: target.nameAm,
          description: target.description,
          tags: target.tags
        }
      });
    }

    const updated = await prisma.organizationHoliday.update({
      where: { id: holiday.id },
      data: {
        autoApply: input.autoApply,
        autoNotify: input.notify !== false,
        autoMessage: input.message?.trim() || null,
        autoOfficeId: input.officeId ?? null,
        autoAllEmployees: !input.employeeIds?.length,
        autoEmployeeIds: input.employeeIds ?? [],
        autoEnabledById: input.autoApply ? audit.actorUserId : null,
        ...(input.autoApply ? {} : { autoAppliedAt: null })
      }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: input.autoApply ? "HOLIDAY_AUTO_ENABLED" : "HOLIDAY_AUTO_DISABLED",
        entityType: "OrganizationHoliday",
        entityId: updated.id,
        newValues: auditJson({
          autoApply: updated.autoApply,
          gregorianDate: formatWorkDateKey(updated.gregorianDate)
        }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });

    let appliedNow = null;
    if (input.autoApply && !updated.autoAppliedAt) {
      const today = todayWorkDateKey(DEFAULT_TZ);
      const dateKey = formatWorkDateKey(updated.gregorianDate);
      if (dateKey <= today) {
        appliedNow = await this.apply(
          organizationId,
          {
            holidayId: updated.id,
            officeId: updated.autoOfficeId,
            employeeIds: updated.autoAllEmployees ? undefined : updated.autoEmployeeIds,
            notify: updated.autoNotify,
            message: updated.autoMessage,
            markAutoApplied: true
          },
          audit,
          scope
        );
      }
    }

    return {
      holiday: holidaySummary(appliedNow?.holiday ? { ...updated, autoAppliedAt: new Date() } : updated),
      appliedNow: appliedNow?.application ?? null
    };
  },

  async runAutoApplyJob() {
    const today = todayWorkDateKey(DEFAULT_TZ);
    const workDate = workDateFromKey(today);
    const due = await prisma.organizationHoliday.findMany({
      where: {
        autoApply: true,
        autoAppliedAt: null,
        gregorianDate: { lte: workDate }
      },
      include: {
        organization: { select: { id: true, isActive: true } }
      }
    });

    let applied = 0;
    let failed = 0;
    const errors: Array<{ holidayId: string; message: string }> = [];

    for (const holiday of due) {
      if (!holiday.organization.isActive) continue;
      const actorUserId = holiday.autoEnabledById;
      if (!actorUserId) {
        failed += 1;
        errors.push({ holidayId: holiday.id, message: "Missing autoEnabledById" });
        continue;
      }

      try {
        await this.apply(
          holiday.organizationId,
          {
            holidayId: holiday.id,
            officeId: holiday.autoOfficeId,
            employeeIds: holiday.autoAllEmployees ? undefined : holiday.autoEmployeeIds,
            notify: holiday.autoNotify,
            message: holiday.autoMessage,
            markAutoApplied: true
          },
          { actorUserId, userAgent: "holiday-auto-apply-job" },
          { allOffices: true, officeIds: [] }
        );
        applied += 1;
      } catch (err) {
        failed += 1;
        errors.push({
          holidayId: holiday.id,
          message: err instanceof Error ? err.message : "Unknown error"
        });
      }
    }

    return { scanned: due.length, applied, failed, errors, workDate: today };
  },

  async application(organizationId: string, id: string, scope: OfficeScope) {
    const row = await prisma.holidayApplication.findFirst({
      where: { id, organizationId },
      include: {
        holiday: true,
        appliedBy: { select: { id: true, email: true } },
        targets: true,
        _count: { select: { assignments: true } }
      }
    });
    if (!row) throw new AppError(404, "APPLICATION_NOT_FOUND", "Holiday application not found");

    let assignmentCount = row._count.assignments;
    if (!scope.allOffices) {
      assignmentCount = await prisma.holidayAssignment.count({
        where: { applicationId: id, employee: { ...employeeOfficeFilter(scope) } }
      });
    }

    return {
      id: row.id,
      status: row.status,
      allOffices: row.allOffices,
      allEmployees: row.allEmployees,
      notifyEmployees: row.notifyEmployees,
      message: row.message,
      assignmentCount,
      notifiedCount: row.notifiedCount,
      appliedAt: row.appliedAt,
      appliedBy: row.appliedBy,
      targets: row.targets,
      holiday: holidaySummary(row.holiday)
    };
  },

  async myHolidays(userId: string, input: { from?: string; to?: string }) {
    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");

    const from = input.from
      ? workDateFromKey(input.from)
      : DateTime.utc().startOf("year").toJSDate();
    const to = input.to
      ? workDateFromKey(input.to)
      : DateTime.utc().endOf("year").toJSDate();

    const rows = await prisma.holidayAssignment.findMany({
      where: {
        employeeId: employee.id,
        workDate: { gte: from, lte: to }
      },
      include: { holiday: true },
      orderBy: { workDate: "asc" }
    });

    return rows.map((r) => ({
      workDate: formatWorkDateKey(r.workDate),
      holiday: holidaySummary(r.holiday)
    }));
  }
};

export type { CatalogHoliday };
