import { DateTime } from "luxon";

export type ScheduleDay = { weekday: number; checkInTime: string; checkOutTime: string };

export type ScheduleWithDays = {
  checkInTime: string;
  checkOutTime: string;
  workingDays: number[];
  timezone: string;
  days: ScheduleDay[];
};

export function scheduledInstant(workDate: string, hhmm: string, timezone: string) {
  const dt = DateTime.fromISO(`${workDate}T${hhmm}:00`, { zone: timezone });
  if (!dt.isValid) throw new Error("Configured schedule time or timezone is invalid");
  return dt;
}

export function dayRuleForWeekday(schedule: ScheduleWithDays, weekday: number) {
  const day = schedule.days.find((d) => d.weekday === weekday);
  if (day) return { checkInTime: day.checkInTime, checkOutTime: day.checkOutTime };
  if (schedule.workingDays.includes(weekday)) {
    return { checkInTime: schedule.checkInTime, checkOutTime: schedule.checkOutTime };
  }
  return null;
}

export function computeDailySchedule(schedule: ScheduleWithDays, officeTimezone: string, now: Date) {
  const zone = officeTimezone || schedule.timezone;
  const localNow = DateTime.fromJSDate(now, { zone });
  const workDate = localNow.toISODate()!;
  const dayRule = dayRuleForWeekday(schedule, localNow.weekday);
  if (!dayRule) return null;
  let scheduledIn = scheduledInstant(workDate, dayRule.checkInTime, zone);
  let scheduledOut = scheduledInstant(workDate, dayRule.checkOutTime, zone);
  if (scheduledOut <= scheduledIn) scheduledOut = scheduledOut.plus({ days: 1 });
  return {
    zone,
    workDate,
    scheduledIn: scheduledIn.toUTC().toJSDate(),
    scheduledOut: scheduledOut.toUTC().toJSDate()
  };
}

/** Instant when the reminder becomes due: `scheduledAt - reminderMinutes`. */
export function reminderDueAt(target: Date, reminderMinutes: number) {
  return new Date(target.getTime() - reminderMinutes * 60_000);
}

/**
 * Scheduled targets that are due for a cron tick (Fkadu-style):
 * `now >= reminderDueAt` and not later than `maxLatenessMinutes` after that.
 *
 * Equivalent range on the scheduled instant:
 * `now + reminderMinutes - maxLateness` … `now + reminderMinutes`
 */
export function reminderDueTargetRange(now: Date, reminderMinutes: number, maxLatenessMinutes: number) {
  const rangeStart = new Date(now.getTime() + (reminderMinutes - maxLatenessMinutes) * 60_000);
  const rangeEnd = new Date(now.getTime() + reminderMinutes * 60_000);
  return { rangeStart, rangeEnd };
}

/** @deprecated Prefer reminderDueTargetRange — kept for callers still using window names. */
export function reminderTargetWindow(now: Date, reminderMinutes: number, maxLatenessMinutes: number) {
  const { rangeStart, rangeEnd } = reminderDueTargetRange(now, reminderMinutes, maxLatenessMinutes);
  return { windowStart: rangeStart, windowEnd: rangeEnd };
}

export function isReminderDue(
  target: Date,
  now: Date,
  reminderMinutes: number,
  maxLatenessMinutes: number
) {
  const dueAt = reminderDueAt(target, reminderMinutes).getTime();
  const t = now.getTime();
  return t >= dueAt && t <= dueAt + maxLatenessMinutes * 60_000;
}

/** @deprecated Prefer isReminderDue. */
export function isInReminderWindow(
  target: Date,
  now: Date,
  reminderMinutes: number,
  maxLatenessMinutes: number
) {
  return isReminderDue(target, now, reminderMinutes, maxLatenessMinutes);
}
