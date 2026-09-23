import { DateTime } from "luxon";
import { formatWorkDateKey } from "../../shared/work-date.js";
import { scheduledInstant } from "./attendance-schedule.js";

export function computeCheckoutMetrics(
  open: {
    actualCheckIn: Date;
    scheduledCheckOut: Date;
    workDate: Date;
    timezone: string;
  },
  now: Date
) {
  const rawWorkedMinutes = Math.max(0, Math.floor((now.getTime() - open.actualCheckIn.getTime()) / 60000));
  const scheduledWorkedMinutes = Math.max(
    0,
    Math.floor((open.scheduledCheckOut.getTime() - open.actualCheckIn.getTime()) / 60000)
  );
  const workDateKey = formatWorkDateKey(open.workDate);
  const checkoutDateKey = DateTime.fromJSDate(now, { zone: open.timezone }).toISODate()!;
  const isCrossDayCheckout = checkoutDateKey > workDateKey;
  const checkoutAfterScheduled = now.getTime() > open.scheduledCheckOut.getTime();

  if (isCrossDayCheckout) {
    return {
      workedMinutes: scheduledWorkedMinutes,
      earlyCheckoutMinutes: 0,
      overtimeMinutes: 0,
      isEarlyCheckout: false,
      isMissingCheckout: true
    };
  }

  if (checkoutAfterScheduled) {
    return {
      workedMinutes: rawWorkedMinutes,
      earlyCheckoutMinutes: 0,
      overtimeMinutes: Math.max(0, Math.floor((now.getTime() - open.scheduledCheckOut.getTime()) / 60000)),
      isEarlyCheckout: false,
      isMissingCheckout: false
    };
  }

  const earlyCheckoutMinutes = Math.max(0, Math.floor((open.scheduledCheckOut.getTime() - now.getTime()) / 60000));
  return {
    workedMinutes: rawWorkedMinutes,
    earlyCheckoutMinutes,
    overtimeMinutes: 0,
    isEarlyCheckout: earlyCheckoutMinutes > 0,
    isMissingCheckout: false
  };
}

export function resolveAutoCheckoutInstant(timezone: string, autoCheckoutTime: string, now: Date) {
  const localNow = DateTime.fromJSDate(now, { zone: timezone });
  const dayKey = localNow.toISODate()!;
  return scheduledInstant(dayKey, autoCheckoutTime, timezone).toUTC().toJSDate();
}

export function isEligibleForAutoCheckout(actualCheckIn: Date, autoCheckoutAt: Date, now: Date) {
  return now.getTime() >= autoCheckoutAt.getTime() && autoCheckoutAt.getTime() > actualCheckIn.getTime();
}

export function systemAutoCheckoutIdempotencyKey(timesheetId: string) {
  return `system-auto:${timesheetId}`;
}
