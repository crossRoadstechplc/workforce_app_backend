import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  allocateFifo,
  annualEntitlement,
  completedYearsOfService,
  expiresOn,
  leaveYearPeriod,
  remainingOf,
  round2,
  serviceMonths,
  todayInZone,
  toUtcDate,
  ymd
} from "./annual-leave.policy.js";

type Db = Prisma.TransactionClient | typeof prisma;

export type AnnualLeaveBucketDto = {
  id: string;
  periodStart: string;
  periodEnd: string;
  serviceYears: number;
  granted: number;
  used: number;
  pending: number;
  expired: number;
  remaining: number;
  expiresOn: string;
  kind: "CURRENT" | "CARRY" | "EXPIRED";
};

export type AnnualLeaveBalanceDto = {
  hireDate: string;
  asOf: string;
  completedYears: number;
  serviceMonthsThisYear: number;
  currentYearGrant: number;
  carriedIn: number;
  entitledTotal: number;
  used: number;
  pending: number;
  expired: number;
  available: number;
  nextAnniversary: string;
  nextYearGrant: number;
  buckets: AnnualLeaveBucketDto[];
  allocations?: Array<{ bucketId: string; periodStart: string; days: number }>;
};

function num(value: unknown): number {
  return round2(Number(value ?? 0));
}

function remainingFromRow(row: { grantedDays: unknown; usedDays: unknown; pendingDays: unknown; expiredDays: unknown }): number {
  return remainingOf({
    grantedDays: num(row.grantedDays),
    usedDays: num(row.usedDays),
    pendingDays: num(row.pendingDays),
    expiredDays: num(row.expiredDays)
  });
}

async function loadEmployee(db: Db, employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { office: { select: { timezone: true } }, schedule: { select: { timezone: true } } }
  });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
  return employee;
}

function asOfForEmployee(employee: { office?: { timezone: string } | null; schedule?: { timezone: string } | null }, now?: Date): Date {
  const zone = employee.office?.timezone ?? employee.schedule?.timezone ?? "Africa/Addis_Ababa";
  return todayInZone(zone, now);
}

export function toBalanceDto(
  employee: { employmentStartDate: Date },
  asOf: Date,
  buckets: Array<{
    id: string;
    periodStart: Date;
    periodEnd: Date;
    expiresOn: Date;
    serviceYears: number;
    grantedDays: unknown;
    usedDays: unknown;
    pendingDays: unknown;
    expiredDays: unknown;
    status: "OPEN" | "EXPIRED";
  }>
): AnnualLeaveBalanceDto {
  const hire = toUtcDate(employee.employmentStartDate);
  const completedYears = completedYearsOfService(hire, asOf);
  const currentPeriod = leaveYearPeriod(hire, completedYears);
  const mapped = buckets.map((bucket) => {
    const remaining = remainingFromRow(bucket);
    const start = ymd(bucket.periodStart);
    const current = ymd(currentPeriod.start);
    const kind: AnnualLeaveBucketDto["kind"] =
      bucket.status === "EXPIRED" ? "EXPIRED" : start === current ? "CURRENT" : "CARRY";
    return {
      id: bucket.id,
      periodStart: start,
      periodEnd: ymd(bucket.periodEnd),
      serviceYears: bucket.serviceYears,
      granted: num(bucket.grantedDays),
      used: num(bucket.usedDays),
      pending: num(bucket.pendingDays),
      expired: num(bucket.expiredDays),
      remaining,
      expiresOn: ymd(bucket.expiresOn),
      kind
    };
  });
  const open = mapped.filter((b) => b.kind !== "EXPIRED");
  const current = open.find((b) => b.kind === "CURRENT");
  const carried = open.filter((b) => b.kind === "CARRY");
  const nextYearStart = completedYears + 1;
  return {
    hireDate: ymd(hire),
    asOf: ymd(asOf),
    completedYears,
    serviceMonthsThisYear: completedYears < 1 ? serviceMonths(hire, asOf) : serviceMonths(currentPeriod.start, asOf),
    currentYearGrant: current?.granted ?? annualEntitlement(completedYears, hire, asOf, currentPeriod.end),
    carriedIn: round2(carried.reduce((sum, b) => sum + Math.max(0, b.remaining), 0)),
    entitledTotal: round2(open.reduce((sum, b) => sum + b.granted, 0)),
    used: round2(open.reduce((sum, b) => sum + b.used, 0)),
    pending: round2(open.reduce((sum, b) => sum + b.pending, 0)),
    expired: round2(mapped.reduce((sum, b) => sum + b.expired, 0)),
    available: round2(Math.max(0, open.reduce((sum, b) => sum + b.remaining, 0))),
    nextAnniversary: ymd(leaveYearPeriod(hire, completedYears + 1).start),
    nextYearGrant: annualEntitlement(completedYears + 1, hire, leaveYearPeriod(hire, completedYears + 1).start, leaveYearPeriod(hire, completedYears + 1).end),
    buckets: mapped
  };
}

type LedgerType = "GRANT" | "TOP_UP" | "RESERVE" | "RELEASE" | "CONSUME" | "EXPIRE" | "ADJUST";

async function writeLedger(
  db: Db,
  input: { employeeId: string; bucketId: string; leaveRequestId?: string | null; type: LedgerType; days: number; note?: string | null }
) {
  await db.annualLeaveLedger.create({
    data: {
      employeeId: input.employeeId,
      bucketId: input.bucketId,
      leaveRequestId: input.leaveRequestId ?? null,
      type: input.type,
      days: input.days,
      note: input.note ?? null
    }
  });
}

export async function ensureAccrual(db: Db, employeeId: string, asOfInput?: Date) {
  const employee = await loadEmployee(db, employeeId);
  const asOf = asOfInput ?? asOfForEmployee(employee);
  const hire = toUtcDate(employee.employmentStartDate);
  if (asOf < hire) return { employee, asOf, buckets: [] as Awaited<ReturnType<typeof db.annualLeaveBucket.findMany>> };

  const yearsStarted = completedYearsOfService(hire, asOf);
  const existing = await db.annualLeaveBucket.findMany({ where: { employeeId }, orderBy: { periodStart: "asc" } });
  const byStart = new Map(existing.map((row) => [ymd(row.periodStart), row]));

  for (let n = 0; n <= yearsStarted; n++) {
    const period = leaveYearPeriod(hire, n);
    const key = ymd(period.start);
    const granted = annualEntitlement(n, hire, asOf, period.end);
    const found = byStart.get(key);
    if (!found) {
      const created = await db.annualLeaveBucket.create({
        data: {
          organizationId: employee.organizationId,
          employeeId,
          periodStart: period.start,
          periodEnd: period.end,
          expiresOn: expiresOn(period.start),
          serviceYears: n,
          grantedDays: granted
        }
      });
      await writeLedger(db, { employeeId, bucketId: created.id, type: "GRANT", days: granted });
      byStart.set(key, created);
      continue;
    }
    const currentGranted = num(found.grantedDays);
    if (granted > currentGranted) {
      const extra = round2(granted - currentGranted);
      const updated = await db.annualLeaveBucket.update({
        where: { id: found.id },
        data: { grantedDays: granted, periodEnd: period.end, expiresOn: expiresOn(period.start) }
      });
      await writeLedger(db, { employeeId, bucketId: found.id, type: "TOP_UP", days: extra });
      byStart.set(key, updated);
    }
  }

  const openRows = await db.annualLeaveBucket.findMany({ where: { employeeId, status: "OPEN" } });
  for (const row of openRows) {
    if (toUtcDate(row.expiresOn) > asOf) continue;
    const leftover = Math.max(0, remainingFromRow(row));
    await db.annualLeaveBucket.update({
      where: { id: row.id },
      data: {
        status: "EXPIRED",
        expiredDays: round2(num(row.expiredDays) + leftover),
        pendingDays: 0
      }
    });
    if (leftover > 0) {
      await writeLedger(db, { employeeId, bucketId: row.id, type: "EXPIRE", days: leftover });
    }
  }

  const buckets = await db.annualLeaveBucket.findMany({ where: { employeeId }, orderBy: { periodStart: "asc" } });
  return { employee, asOf, buckets };
}

async function syncUsageFromRequests(db: Db, employeeId: string) {
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { organizationId: true } });
  if (!employee) return;
  const allocated = await db.leaveBalanceAllocation.findMany({
    where: { leaveRequest: { employeeId } },
    select: { leaveRequestId: true }
  });
  const done = new Set(allocated.map((row) => row.leaveRequestId));
  const requests = await db.leaveRequest.findMany({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      leaveType: { tracksBalance: true, organizationId: employee.organizationId }
    },
    orderBy: [{ startDate: "asc" }, { requestedAt: "asc" }]
  });
  for (const request of requests) {
    if (done.has(request.id)) continue;
    try {
      await applyToBuckets(db, {
        employeeId,
        leaveRequestId: request.id,
        days: num(request.numberOfDays),
        mode: request.status === "APPROVED" ? "CONSUME" : "RESERVE",
        allowOverdraw: true
      });
    } catch {
      // Historical requests that cannot be allocated are skipped; remaining stays as-is.
    }
  }
}

async function openBucketsOldestFirst(db: Db, employeeId: string) {
  const rows = await db.annualLeaveBucket.findMany({
    where: { employeeId, status: "OPEN" },
    orderBy: { periodStart: "asc" }
  });
  return rows.map((row) => ({
    row,
    remaining: remainingFromRow(row)
  }));
}

async function applyToBuckets(
  db: Db,
  input: {
    employeeId: string;
    leaveRequestId: string;
    days: number;
    mode: "RESERVE" | "CONSUME";
    allowOverdraw?: boolean;
  }
) {
  const open = await openBucketsOldestFirst(db, input.employeeId);
  const result = allocateFifo(
    open.map((item) => ({ id: item.row.id, remaining: item.remaining })),
    input.days
  );
  let allocations = result.allocations;
  if (!result.ok) {
    if (!input.allowOverdraw) {
      throw new AppError(422, "INSUFFICIENT_LEAVE_BALANCE", "Not enough annual leave remaining for this request", {
        available: round2(open.reduce((sum, item) => sum + Math.max(0, item.remaining), 0)),
        requested: input.days,
        shortfall: result.shortfall
      });
    }
    const newest = open.at(-1);
    if (newest && result.shortfall > 0) {
      const existing = allocations.find((item) => item.bucketId === newest.row.id);
      if (existing) existing.days = round2(existing.days + result.shortfall);
      else allocations = [...allocations, { bucketId: newest.row.id, days: result.shortfall }];
    }
  }
  for (const allocation of allocations) {
    const row = open.find((item) => item.row.id === allocation.bucketId)?.row;
    if (!row) continue;
    if (input.mode === "RESERVE") {
      await db.annualLeaveBucket.update({
        where: { id: row.id },
        data: { pendingDays: round2(num(row.pendingDays) + allocation.days) }
      });
      await writeLedger(db, {
        employeeId: input.employeeId,
        bucketId: row.id,
        leaveRequestId: input.leaveRequestId,
        type: "RESERVE",
        days: allocation.days
      });
    } else {
      await db.annualLeaveBucket.update({
        where: { id: row.id },
        data: { usedDays: round2(num(row.usedDays) + allocation.days) }
      });
      await writeLedger(db, {
        employeeId: input.employeeId,
        bucketId: row.id,
        leaveRequestId: input.leaveRequestId,
        type: "CONSUME",
        days: allocation.days
      });
    }
    await db.leaveBalanceAllocation.upsert({
      where: { leaveRequestId_bucketId: { leaveRequestId: input.leaveRequestId, bucketId: row.id } },
      create: { leaveRequestId: input.leaveRequestId, bucketId: row.id, days: allocation.days },
      update: { days: allocation.days }
    });
  }
  return allocations;
}

export const annualLeaveService = {
  async balanceForEmployee(employeeId: string, asOf?: Date): Promise<AnnualLeaveBalanceDto> {
    return prisma.$transaction(async (tx) => {
      await ensureAccrual(tx, employeeId, asOf);
      await syncUsageFromRequests(tx, employeeId);
      const { employee, asOf: day, buckets } = await ensureAccrual(tx, employeeId, asOf);
      return toBalanceDto(employee, day, buckets);
    });
  },

  async balancesForEmployees(employeeIds: string[]): Promise<Map<string, AnnualLeaveBalanceDto>> {
    const unique = [...new Set(employeeIds)];
    const entries = await Promise.all(unique.map(async (id) => [id, await this.balanceForEmployee(id)] as const));
    return new Map(entries);
  },

  async reserve(db: Db, input: { employeeId: string; leaveRequestId: string; days: number }) {
    await ensureAccrual(db, input.employeeId);
    return applyToBuckets(db, { ...input, mode: "RESERVE" });
  },

  async consumeReserved(db: Db, leaveRequestId: string) {
    const allocations = await db.leaveBalanceAllocation.findMany({ where: { leaveRequestId }, include: { bucket: true } });
    if (!allocations.length) {
      const request = await db.leaveRequest.findUnique({ where: { id: leaveRequestId } });
      if (!request) return;
      await ensureAccrual(db, request.employeeId);
      await applyToBuckets(db, {
        employeeId: request.employeeId,
        leaveRequestId,
        days: num(request.numberOfDays),
        mode: "CONSUME",
        allowOverdraw: true
      });
      return;
    }
    for (const allocation of allocations) {
      const pending = num(allocation.bucket.pendingDays);
      const used = num(allocation.bucket.usedDays);
      const days = num(allocation.days);
      await db.annualLeaveBucket.update({
        where: { id: allocation.bucketId },
        data: {
          pendingDays: round2(Math.max(0, pending - days)),
          usedDays: round2(used + days)
        }
      });
      await writeLedger(db, {
        employeeId: allocation.bucket.employeeId,
        bucketId: allocation.bucketId,
        leaveRequestId,
        type: "CONSUME",
        days
      });
    }
  },

  async release(db: Db, leaveRequestId: string, mode: "pending" | "used" = "pending") {
    const allocations = await db.leaveBalanceAllocation.findMany({ where: { leaveRequestId }, include: { bucket: true } });
    for (const allocation of allocations) {
      const days = num(allocation.days);
      if (mode === "pending") {
        await db.annualLeaveBucket.update({
          where: { id: allocation.bucketId },
          data: { pendingDays: round2(Math.max(0, num(allocation.bucket.pendingDays) - days)) }
        });
      } else {
        await db.annualLeaveBucket.update({
          where: { id: allocation.bucketId },
          data: { usedDays: round2(Math.max(0, num(allocation.bucket.usedDays) - days)) }
        });
      }
      await writeLedger(db, {
        employeeId: allocation.bucket.employeeId,
        bucketId: allocation.bucketId,
        leaveRequestId,
        type: "RELEASE",
        days
      });
    }
    if (allocations.length) {
      await db.leaveBalanceAllocation.deleteMany({ where: { leaveRequestId } });
    }
  },

  async rebuild(db: Db, employeeId: string) {
    await db.leaveBalanceAllocation.deleteMany({ where: { leaveRequest: { employeeId } } });
    await db.annualLeaveLedger.deleteMany({ where: { employeeId } });
    await db.annualLeaveBucket.deleteMany({ where: { employeeId } });
    await ensureAccrual(db, employeeId);
    await syncUsageFromRequests(db, employeeId);
  },

  async adjust(employeeId: string, days: number, note: string, leaveRequestId?: string) {
    const amount = round2(days);
    if (amount === 0) throw new AppError(422, "INVALID_ADJUSTMENT", "Adjustment days cannot be zero");
    return prisma.$transaction(async (tx) => {
      await ensureAccrual(tx, employeeId);
      if (amount > 0) {
        const current = await tx.annualLeaveBucket.findFirst({
          where: { employeeId, status: "OPEN" },
          orderBy: { periodStart: "desc" }
        });
        if (!current) throw new AppError(422, "NO_LEAVE_BUCKET", "No annual leave year is open for this employee");
        await tx.annualLeaveBucket.update({
          where: { id: current.id },
          data: { grantedDays: round2(num(current.grantedDays) + amount) }
        });
        await writeLedger(tx, { employeeId, bucketId: current.id, leaveRequestId, type: "ADJUST", days: amount, note });
      } else {
        const need = Math.abs(amount);
        const open = await openBucketsOldestFirst(tx, employeeId);
        const result = allocateFifo(
          open.map((item) => ({ id: item.row.id, remaining: item.remaining })),
          need
        );
        if (!result.ok) {
          throw new AppError(422, "INSUFFICIENT_LEAVE_BALANCE", "Not enough remaining leave to deduct", {
            shortfall: result.shortfall
          });
        }
        for (const allocation of result.allocations) {
          const row = open.find((item) => item.row.id === allocation.bucketId)!.row;
          await tx.annualLeaveBucket.update({
            where: { id: row.id },
            data: { usedDays: round2(num(row.usedDays) + allocation.days) }
          });
          await writeLedger(tx, {
            employeeId,
            bucketId: row.id,
            leaveRequestId,
            type: "ADJUST",
            days: -allocation.days,
            note
          });
        }
      }
      const { employee, asOf, buckets } = await ensureAccrual(tx, employeeId);
      return toBalanceDto(employee, asOf, buckets);
    });
  },

  allocationsForRequest(allocations: Array<{ bucketId: string; days: unknown; bucket?: { periodStart: Date } }>) {
    return allocations.map((row) => ({
      bucketId: row.bucketId,
      periodStart: row.bucket ? ymd(row.bucket.periodStart) : "",
      days: num(row.days)
    }));
  }
};
