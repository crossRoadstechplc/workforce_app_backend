import { describe, expect, it } from "vitest";
import {
  computeDailySchedule,
  dayRuleForWeekday,
  isReminderDue,
  reminderDueAt,
  reminderDueTargetRange,
  scheduledInstant,
  type ScheduleWithDays
} from "./attendance-schedule.js";

const schedule: ScheduleWithDays = {
  checkInTime: "09:00",
  checkOutTime: "17:00",
  workingDays: [1, 2, 3, 4, 5],
  timezone: "Africa/Addis_Ababa",
  days: [
    { weekday: 1, checkInTime: "09:00", checkOutTime: "17:00" },
    { weekday: 2, checkInTime: "09:00", checkOutTime: "17:00" },
    { weekday: 3, checkInTime: "09:00", checkOutTime: "17:00" },
    { weekday: 4, checkInTime: "09:00", checkOutTime: "17:00" },
    { weekday: 5, checkInTime: "09:00", checkOutTime: "17:00" }
  ]
};

describe("reminderDueAt", () => {
  it("is reminderMinutes before the scheduled target", () => {
    const target = new Date("2026-09-21T09:00:00.000Z");
    expect(reminderDueAt(target, 5).toISOString()).toBe("2026-09-21T08:55:00.000Z");
  });
});

describe("reminderDueTargetRange", () => {
  it("covers due-and-catch-up scheduled targets for a cron tick", () => {
    const now = new Date("2026-09-21T08:55:00.000Z");
    // Reminder at T-5; catch-up 15 → targets from now-10 … now+5
    const { rangeStart, rangeEnd } = reminderDueTargetRange(now, 5, 15);
    expect(rangeStart.toISOString()).toBe("2026-09-21T08:45:00.000Z");
    expect(rangeEnd.toISOString()).toBe("2026-09-21T09:00:00.000Z");
  });
});

describe("isReminderDue", () => {
  const target = new Date("2026-09-21T09:00:00.000Z");

  it("sends when now reaches reminderTime (Fkadu-style)", () => {
    const now = new Date("2026-09-21T08:55:00.000Z");
    expect(isReminderDue(target, now, 5, 15)).toBe(true);
  });

  it("still sends on a late cron tick within catch-up slack", () => {
    const now = new Date("2026-09-21T09:05:00.000Z");
    expect(isReminderDue(target, now, 5, 15)).toBe(true);
  });

  it("does not send before reminderTime", () => {
    const now = new Date("2026-09-21T08:40:00.000Z");
    expect(isReminderDue(target, now, 5, 15)).toBe(false);
  });

  it("does not send after catch-up slack expires", () => {
    const now = new Date("2026-09-21T09:20:00.000Z"); // dueAt 08:55 + 15 = 09:10
    expect(isReminderDue(target, now, 5, 15)).toBe(false);
  });
});

describe("dayRuleForWeekday", () => {
  it("returns per-day times when configured", () => {
    expect(dayRuleForWeekday(schedule, 1)).toEqual({ checkInTime: "09:00", checkOutTime: "17:00" });
  });

  it("returns null on non-working days", () => {
    expect(dayRuleForWeekday(schedule, 7)).toBeNull();
  });

  it("falls back to legacy schedule times when day row is missing", () => {
    const legacy = { ...schedule, days: [] };
    expect(dayRuleForWeekday(legacy, 1)).toEqual({ checkInTime: "09:00", checkOutTime: "17:00" });
  });
});

describe("computeDailySchedule", () => {
  it("computes scheduled instants for a working day", () => {
    const now = new Date("2026-09-21T05:54:00.000Z"); // 08:54 in Addis Ababa (UTC+3)
    const daily = computeDailySchedule(schedule, "Africa/Addis_Ababa", now);
    expect(daily).not.toBeNull();
    expect(daily!.workDate).toBe("2026-09-21");
    expect(daily!.scheduledIn.toISOString()).toBe("2026-09-21T06:00:00.000Z");
    expect(daily!.scheduledOut.toISOString()).toBe("2026-09-21T14:00:00.000Z");
  });

  it("returns null on non-working days", () => {
    const now = new Date("2026-09-20T05:54:00.000Z"); // Sunday in Addis Ababa
    expect(computeDailySchedule(schedule, "Africa/Addis_Ababa", now)).toBeNull();
  });
});

describe("scheduledInstant", () => {
  it("builds a timezone-aware instant", () => {
    const dt = scheduledInstant("2026-09-21", "09:00", "Africa/Addis_Ababa");
    expect(dt.toUTC().toISO()).toBe("2026-09-21T06:00:00.000Z");
  });
});
