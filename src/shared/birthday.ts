import { DateTime } from "luxon";

const DEFAULT_TZ = "Africa/Addis_Ababa";

/** Month/day of a Prisma `@db.Date` birth date (stored as UTC midnight). */
export function birthMonthDay(birthDate: Date): { month: number; day: number } {
  const dt = DateTime.fromJSDate(birthDate, { zone: "utc" });
  return { month: dt.month, day: dt.day };
}

/**
 * True when `birthDate` falls on "today" in `timezone`.
 * Feb 29 birthdays celebrate on Feb 28 in non-leap years.
 */
export function isBirthdayOnDate(birthDate: Date | null | undefined, now: DateTime, timezone = DEFAULT_TZ): boolean {
  if (!birthDate) return false;
  const today = now.setZone(timezone);
  const { month, day } = birthMonthDay(birthDate);
  if (month === 2 && day === 29 && !today.isInLeapYear) {
    return today.month === 2 && today.day === 28;
  }
  return today.month === month && today.day === day;
}

export function birthdayTimezone(officeTz?: string | null, scheduleTz?: string | null): string {
  return officeTz || scheduleTz || DEFAULT_TZ;
}

export function formatBirthdayPersonName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
