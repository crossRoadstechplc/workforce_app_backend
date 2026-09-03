import { describe, expect, it } from "vitest";
import { performanceBand, rateReliabilityAttendance } from "./attendance-rating.js";

describe("rateReliabilityAttendance", () => {
  it("stays at 5 with approved leave and no late days", () => {
    const r = rateReliabilityAttendance({
      expectedDays: 20,
      attendanceDays: 18,
      lateDays: 0,
      lateMinutes: 0,
      missingCheckoutDays: 0,
      approvedLeaveDays: 2
    });
    expect(r.unexcusedAbsentDays).toBe(0);
    expect(r.score).toBe(5);
  });

  it("penalizes unexcused absence and lateness, never below 1", () => {
    const r = rateReliabilityAttendance({
      expectedDays: 20,
      attendanceDays: 10,
      lateDays: 8,
      lateMinutes: 200,
      missingCheckoutDays: 4,
      approvedLeaveDays: 0
    });
    expect(r.unexcusedAbsentDays).toBe(10);
    expect(r.score).toBe(1);
  });
});

describe("performanceBand", () => {
  it("maps totals to bands", () => {
    expect(performanceBand(48)).toBe("OUTSTANDING");
    expect(performanceBand(40)).toBe("EXCEEDS_EXPECTATIONS");
    expect(performanceBand(33)).toBe("MEETS_EXPECTATIONS");
    expect(performanceBand(22)).toBe("NEEDS_IMPROVEMENT");
    expect(performanceBand(12)).toBe("UNSATISFACTORY");
  });
});
