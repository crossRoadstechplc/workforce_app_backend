import { DateTime } from "luxon";

export type ScheduleDayTimes = {
  weekday: number;
  checkInTime: string;
  checkOutTime: string;
};

export type ScheduleForFraction = {
  workingDays: number[];
  checkInTime?: string;
  checkOutTime?: string;
  days?: ScheduleDayTimes[];
};

export type LeaveDaySession = "FULL" | "MORNING" | "AFTERNOON";

export type LeaveDayPlan = {
  date: Date;
  session: LeaveDaySession;
  dayFraction: number;
};

/** Minutes between HH:mm strings. Returns 0 if invalid or checkout <= checkin. */
export function scheduledMinutes(checkInTime: string, checkOutTime: string): number {
  const [ih, im] = checkInTime.split(":").map(Number);
  const [oh, om] = checkOutTime.split(":").map(Number);
  if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return 0;
  const mins = oh * 60 + om - (ih * 60 + im);
  return mins > 0 ? mins : 0;
}

function dayRules(schedule: ScheduleForFraction): Map<number, { checkInTime: string; checkOutTime: string }> {
  const map = new Map<number, { checkInTime: string; checkOutTime: string }>();
  if (schedule.days?.length) {
    for (const d of schedule.days) {
      map.set(d.weekday, { checkInTime: d.checkInTime, checkOutTime: d.checkOutTime });
    }
    return map;
  }
  const checkIn = schedule.checkInTime ?? "08:30";
  const checkOut = schedule.checkOutTime ?? "17:30";
  for (const weekday of schedule.workingDays) {
    map.set(weekday, { checkInTime: checkIn, checkOutTime: checkOut });
  }
  return map;
}

/** Longest scheduled day in minutes; used as 1.0 leave day. Fallback 8 hours. */
export function fullDayMinutes(schedule: ScheduleForFraction): number {
  const rules = dayRules(schedule);
  let max = 0;
  for (const rule of rules.values()) {
    max = Math.max(max, scheduledMinutes(rule.checkInTime, rule.checkOutTime));
  }
  return max > 0 ? max : 8 * 60;
}

/** Leave fraction for a weekday (0 if not a working day). Half-day Sat → ~0.5. */
export function leaveFractionForWeekday(schedule: ScheduleForFraction, weekday: number): number {
  const rules = dayRules(schedule);
  const rule = rules.get(weekday);
  if (!rule) return 0;
  const mins = scheduledMinutes(rule.checkInTime, rule.checkOutTime);
  if (mins <= 0) return 0;
  const full = fullDayMinutes(schedule);
  return Math.round((mins / full) * 100) / 100;
}

export function sessionMultiplier(session: LeaveDaySession): number {
  return session === "FULL" ? 1 : 0.5;
}

export function utcDateKey(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISODate()!;
}

/** Working days in range with default FULL session and schedule-based fractions. */
export function workingLeaveDays(
  start: Date,
  end: Date,
  zone: string,
  schedule: ScheduleForFraction
): LeaveDayPlan[] {
  let cur = DateTime.fromJSDate(start, { zone: "utc" }).setZone(zone, { keepLocalTime: true }).startOf("day");
  const stop = DateTime.fromJSDate(end, { zone: "utc" }).setZone(zone, { keepLocalTime: true }).startOf("day");
  if (stop < cur) return [];
  const out: LeaveDayPlan[] = [];
  while (cur <= stop) {
    const fraction = leaveFractionForWeekday(schedule, cur.weekday);
    if (fraction > 0) {
      out.push({
        date: new Date(Date.UTC(cur.year, cur.month - 1, cur.day)),
        session: "FULL",
        dayFraction: fraction
      });
    }
    cur = cur.plus({ days: 1 });
  }
  return out;
}

/**
 * Apply user-selected sessions to working days.
 * Unknown dates in `sessions` are ignored; missing working days default to FULL.
 */
export function applyLeaveSessions(
  workingDays: LeaveDayPlan[],
  sessions?: Array<{ date: Date; session: LeaveDaySession }>
): LeaveDayPlan[] {
  const byKey = new Map<string, LeaveDaySession>();
  for (const row of sessions ?? []) {
    byKey.set(utcDateKey(row.date), row.session);
  }
  return workingDays.map((day) => {
    const session = byKey.get(utcDateKey(day.date)) ?? "FULL";
    const dayFraction = Math.round(day.dayFraction * sessionMultiplier(session) * 100) / 100;
    return { ...day, session, dayFraction };
  });
}

export function sumLeaveDayFractions(days: LeaveDayPlan[]): number {
  return Math.round(days.reduce((n, d) => n + d.dayFraction, 0) * 100) / 100;
}

export function leaveDaysBetween(
  start: Date,
  end: Date,
  zone: string,
  schedule: ScheduleForFraction
): number {
  return sumLeaveDayFractions(workingLeaveDays(start, end, zone, schedule));
}

/** True when two leave sessions on the same calendar day conflict. */
export function leaveSessionsConflict(a: LeaveDaySession, b: LeaveDaySession): boolean {
  if (a === "FULL" || b === "FULL") return true;
  return a === b;
}
