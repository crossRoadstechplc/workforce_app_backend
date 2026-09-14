import { describe, expect, it } from "vitest";
import {
  allocateFifo,
  annualEntitlement,
  BASE_ANNUAL_DAYS,
  completedYearsOfService,
  expiresOn,
  leaveYearPeriod,
  proRataLeave,
  remainingOf,
  serviceMonths,
  toUtcDate
} from "./annual-leave.policy.js";

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

describe("completedYearsOfService", () => {
  it("uses hire-date anniversary, not calendar year", () => {
    const hire = utc(2023, 12, 20);
    expect(completedYearsOfService(hire, utc(2025, 1, 1))).toBe(1);
    expect(completedYearsOfService(hire, utc(2025, 12, 19))).toBe(1);
    expect(completedYearsOfService(hire, utc(2025, 12, 20))).toBe(2);
  });

  it("handles Feb 29 hires on non-leap years", () => {
    const hire = utc(2020, 2, 29);
    expect(completedYearsOfService(hire, utc(2021, 2, 27))).toBe(0);
    expect(completedYearsOfService(hire, utc(2021, 2, 28))).toBe(1);
    expect(completedYearsOfService(hire, utc(2024, 2, 29))).toBe(4);
  });
});

describe("annualEntitlement", () => {
  it("matches Ethiopian formula examples", () => {
    const hire = utc(2016, 3, 15);
    const asOf = utc(2026, 3, 15);
    const periodEnd = utc(2026, 3, 14);
    expect(annualEntitlement(1, hire, asOf, periodEnd)).toBe(16);
    expect(annualEntitlement(2, hire, asOf, periodEnd)).toBe(16);
    expect(annualEntitlement(3, hire, asOf, periodEnd)).toBe(17);
    expect(annualEntitlement(4, hire, asOf, periodEnd)).toBe(17);
    expect(annualEntitlement(5, hire, asOf, periodEnd)).toBe(18);
    expect(annualEntitlement(9, hire, asOf, periodEnd)).toBe(20);
  });

  it("uses pro-rata before the first anniversary", () => {
    const hire = utc(2026, 1, 1);
    expect(serviceMonths(hire, utc(2026, 7, 1))).toBe(6);
    expect(proRataLeave(hire, utc(2026, 7, 1))).toBe(8);
    expect(annualEntitlement(0, hire, utc(2026, 7, 1), utc(2026, 12, 31))).toBe(8);
    expect(annualEntitlement(0, hire, utc(2027, 1, 1), utc(2026, 12, 31))).toBe(16);
  });
});

describe("carry-forward window", () => {
  it("lets unused leave survive two further years then expire", () => {
    const start = utc(2024, 3, 15);
    expect(expiresOn(start)).toEqual(utc(2027, 3, 15));
  });
});

describe("allocateFifo", () => {
  it("consumes oldest carry first, matching the 22-day example", () => {
    const buckets = [
      { id: "y1", remaining: 6 },
      { id: "y2", remaining: 16 }
    ];
    expect(remainingOf({ grantedDays: 16, usedDays: 10, pendingDays: 0, expiredDays: 0 })).toBe(6);
    const eight = allocateFifo(buckets, 8);
    expect(eight).toEqual({
      ok: true,
      allocations: [
        { bucketId: "y1", days: 6 },
        { bucketId: "y2", days: 2 }
      ]
    });
    const tooMuch = allocateFifo(buckets, 23);
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.shortfall).toBe(1);
  });
});

describe("leaveYearPeriod", () => {
  it("runs from anniversary to the day before the next anniversary", () => {
    const hire = utc(2024, 3, 15);
    expect(leaveYearPeriod(hire, 0)).toEqual({ start: utc(2024, 3, 15), end: utc(2025, 3, 14) });
    expect(leaveYearPeriod(hire, 1)).toEqual({ start: utc(2025, 3, 15), end: utc(2026, 3, 14) });
  });
});

describe("round helpers", () => {
  it("keeps date-only UTC values", () => {
    expect(toUtcDate(new Date("2026-03-15T18:22:00.000Z"))).toEqual(utc(2026, 3, 15));
    expect(BASE_ANNUAL_DAYS).toBe(16);
  });
});
