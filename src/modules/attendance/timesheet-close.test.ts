import { describe, expect, it } from "vitest";
import {
  computeCheckoutMetrics,
  isEligibleForAutoCheckout,
  resolveAutoCheckoutInstant
} from "./auto-checkout.logic.js";
import { workDateFromKey } from "../../shared/work-date.js";

describe("resolveAutoCheckoutInstant", () => {
  it("builds today auto-checkout at configured local time", () => {
    const now = new Date("2026-09-22T17:30:00.000Z"); // 20:30 in Addis
    const instant = resolveAutoCheckoutInstant("Africa/Addis_Ababa", "22:00", now);
    expect(instant.toISOString()).toBe("2026-09-22T19:00:00.000Z");
  });
});

describe("isEligibleForAutoCheckout", () => {
  it("requires now past auto time and auto time after check-in", () => {
    const checkIn = new Date("2026-09-22T06:00:00.000Z");
    const autoAt = new Date("2026-09-22T19:00:00.000Z");
    const before = new Date("2026-09-22T18:59:00.000Z");
    const after = new Date("2026-09-22T19:01:00.000Z");
    expect(isEligibleForAutoCheckout(checkIn, autoAt, before)).toBe(false);
    expect(isEligibleForAutoCheckout(checkIn, autoAt, after)).toBe(true);
  });
});

describe("computeCheckoutMetrics", () => {
  it("marks cross-day checkout as missing", () => {
    const open = {
      actualCheckIn: new Date("2026-09-21T06:00:00.000Z"),
      scheduledCheckOut: new Date("2026-09-21T14:00:00.000Z"),
      workDate: workDateFromKey("2026-09-21"),
      timezone: "Africa/Addis_Ababa"
    };
    const checkoutAt = new Date("2026-09-22T19:00:00.000Z");
    const metrics = computeCheckoutMetrics(open, checkoutAt);
    expect(metrics.isMissingCheckout).toBe(true);
  });
});
