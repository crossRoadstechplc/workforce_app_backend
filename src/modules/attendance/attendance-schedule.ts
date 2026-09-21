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

export function reminderTargetWindow(now: Date, reminderMinutes: number, slackMinutes: number) {
  const windowStart = new Date(now.getTime() + (reminderMinutes - slackMinutes) * 60_000);
  const windowEnd = new Date(now.getTime() + (reminderMinutes + slackMinutes) * 60_000);
  return { windowStart, windowEnd };
}

export function isInReminderWindow(target: Date, now: Date, reminderMinutes: number, slackMinutes: number) {
  const { windowStart, windowEnd } = reminderTargetWindow(now, reminderMinutes, slackMinutes);
  return target >= windowStart && target <= windowEnd;
}
