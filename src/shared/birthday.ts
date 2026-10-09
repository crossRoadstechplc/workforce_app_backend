import { DateTime } from "luxon";

const DEFAULT_TZ = "Africa/Addis_Ababa";

/** Dummy year for month/day-only birth storage (leap year so Feb 29 is valid). */
export const BIRTH_DATE_STORAGE_YEAR = 2000;

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

/**
 * Birthday occurrence inside the ISO week (Mon–Sun) containing `now`, or null.
 * Handles weeks that span a year boundary and Feb 29 in non-leap years.
 */
export function birthdayInWeek(
  birthDate: Date | null | undefined,
  now: DateTime,
  timezone = DEFAULT_TZ
): DateTime | null {
  if (!birthDate) return null;
  const local = now.setZone(timezone);
  const weekStart = local.startOf("week");
  const weekEnd = local.endOf("week");
  const { month, day } = birthMonthDay(birthDate);
  const years = weekStart.year === weekEnd.year ? [weekStart.year] : [weekStart.year, weekEnd.year];

  for (const year of years) {
    let occurrence = DateTime.fromObject({ year, month, day }, { zone: timezone });
    if (!occurrence.isValid && month === 2 && day === 29) {
      occurrence = DateTime.fromObject({ year, month: 2, day: 28 }, { zone: timezone });
    }
    if (!occurrence.isValid) continue;
    if (occurrence >= weekStart.startOf("day") && occurrence <= weekEnd.endOf("day")) {
      return occurrence;
    }
  }
  return null;
}

export function formatBirthdayWeekLabel(occurrence: DateTime): string {
  return occurrence.toFormat("ccc d LLL");
}

export function birthdayTimezone(officeTz?: string | null, scheduleTz?: string | null): string {
  return officeTz || scheduleTz || DEFAULT_TZ;
}

export function formatBirthdayPersonName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}
