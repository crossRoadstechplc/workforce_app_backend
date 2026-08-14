import { DateTime } from "luxon";

/** Calendar date key (YYYY-MM-DD) from a Prisma @db.Date value. */
export function formatWorkDateKey(workDate: Date): string {
  return DateTime.fromJSDate(workDate, { zone: "utc" }).toISODate()!;
}

/** Prisma @db.Date value for a calendar date key in office-local terms. */
export function workDateFromKey(isoDate: string): Date {
  const dt = DateTime.fromISO(isoDate, { zone: "utc" });
  if (!dt.isValid) throw new Error(`Invalid work date: ${isoDate}`);
  return dt.toJSDate();
}

/** Today's calendar date in the given IANA timezone. */
export function todayWorkDateKey(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

/** Prisma @db.Date for today in the given IANA timezone. */
export function todayWorkDate(timezone: string): Date {
  return workDateFromKey(todayWorkDateKey(timezone));
}

export function withFormattedWorkDate<T extends { workDate: Date }>(
  row: T
): Omit<T, "workDate"> & { workDate: string } {
  return { ...row, workDate: formatWorkDateKey(row.workDate) };
}

export function mapFormattedWorkDates<T extends { workDate: Date }>(
  rows: T[]
): Array<Omit<T, "workDate"> & { workDate: string }> {
  return rows.map(withFormattedWorkDate);
}
