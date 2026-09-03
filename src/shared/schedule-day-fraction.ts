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

export function leaveDaysBetween(
  start: Date,
  end: Date,
  zone: string,
  schedule: ScheduleForFraction
): number {
  let cur = DateTime.fromJSDate(start, { zone: "utc" }).setZone(zone, { keepLocalTime: true }).startOf("day");
  const stop = DateTime.fromJSDate(end, { zone: "utc" }).setZone(zone, { keepLocalTime: true }).startOf("day");
  if (stop < cur) return 0;
  let total = 0;
  while (cur <= stop) {
    total += leaveFractionForWeekday(schedule, cur.weekday);
    cur = cur.plus({ days: 1 });
  }
  return Math.round(total * 100) / 100;
}
