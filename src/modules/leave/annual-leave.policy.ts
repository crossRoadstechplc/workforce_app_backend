export const BASE_ANNUAL_DAYS = 16;
export const DAYS_PER_SERVICE_MONTH = 26;
export const MAX_CARRY_YEARS = 2;

const MS_PER_DAY = 86_400_000;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toUtcDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function addUtcDays(value: Date, days: number): Date {
  const d = toUtcDate(value);
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function addCalendarYearsUtc(value: Date, years: number): Date {
  const d = toUtcDate(value);
  const year = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function utcDayDiff(from: Date, to: Date): number {
  return Math.floor((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY);
}

export function ymd(value: Date): string {
  return toUtcDate(value).toISOString().slice(0, 10);
}

/** Full hire-date anniversaries completed on `asOf`. */
export function completedYearsOfService(hire: Date, asOf: Date): number {
  const start = toUtcDate(hire);
  const day = toUtcDate(asOf);
  if (day < start) return 0;
  let years = day.getUTCFullYear() - start.getUTCFullYear();
  const anniversary = addCalendarYearsUtc(start, years);
  if (day < anniversary) years -= 1;
  return Math.max(0, years);
}

export function serviceMonths(hire: Date, asOf: Date): number {
  const days = utcDayDiff(hire, asOf);
  if (days <= 0) return 0;
  return Math.floor(days / DAYS_PER_SERVICE_MONTH);
}

export function proRataLeave(hire: Date, asOf: Date): number {
  const months = Math.min(12, serviceMonths(hire, asOf));
  return round2((BASE_ANNUAL_DAYS * months) / 12);
}

/** Entitlement for a leave year that starts after `completedYearsAtStart` years of service. */
export function annualEntitlement(completedYearsAtStart: number, hire: Date, asOf: Date, periodEnd: Date): number {
  if (completedYearsAtStart < 1) {
    if (toUtcDate(asOf) >= addUtcDays(toUtcDate(periodEnd), 1) || completedYearsOfService(hire, asOf) >= 1) {
      return BASE_ANNUAL_DAYS;
    }
    return proRataLeave(hire, asOf);
  }
  return BASE_ANNUAL_DAYS + Math.floor((completedYearsAtStart - 1) / 2);
}

export function leaveYearPeriod(hire: Date, completedYearsAtStart: number): { start: Date; end: Date } {
  const start = addCalendarYearsUtc(hire, completedYearsAtStart);
  const next = addCalendarYearsUtc(hire, completedYearsAtStart + 1);
  return { start, end: addUtcDays(next, -1) };
}

export function expiresOn(periodStart: Date): Date {
  return addCalendarYearsUtc(periodStart, 1 + MAX_CARRY_YEARS);
}

export function todayInZone(zone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

export type FifoBucket = { id: string; remaining: number };
export type FifoAllocation = { bucketId: string; days: number };

export function allocateFifo(
  buckets: FifoBucket[],
  days: number
): { ok: true; allocations: FifoAllocation[] } | { ok: false; shortfall: number; allocations: FifoAllocation[] } {
  let need = round2(Math.max(0, days));
  const allocations: FifoAllocation[] = [];
  for (const bucket of buckets) {
    if (need <= 0) break;
    const take = round2(Math.min(Math.max(0, bucket.remaining), need));
    if (take <= 0) continue;
    allocations.push({ bucketId: bucket.id, days: take });
    need = round2(need - take);
  }
  if (need > 0) return { ok: false, shortfall: need, allocations };
  return { ok: true, allocations };
}

export function remainingOf(bucket: { grantedDays: number; usedDays: number; pendingDays: number; expiredDays: number }): number {
  return round2(bucket.grantedDays - bucket.usedDays - bucket.pendingDays - bucket.expiredDays);
}
