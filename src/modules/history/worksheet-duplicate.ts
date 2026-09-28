import { DateTime } from "luxon";
import { AppError } from "../../shared/errors/app-error.js";
import { formatWorkDateKey, workDateFromKey } from "../../shared/work-date.js";

/** Calendar days before the worksheet date to scan for exact copies. */
export const WORKSHEET_COPY_LOOKBACK_DAYS = 2;

export type WorksheetReader = {
  worksheet: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { workDescription: true; workDate: true };
    }) => Promise<Array<{ workDescription: string; workDate: Date }>>;
  };
};

/** Normalize for exact copy comparison (trim, collapse space, case-insensitive). */
export function normalizeWorksheetDescription(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isExactWorksheetCopy(candidate: string, previous: string): boolean {
  const a = normalizeWorksheetDescription(candidate);
  const b = normalizeWorksheetDescription(previous);
  if (!a || !b) return false;
  return a === b;
}

/** Inclusive start date key for the lookback window (workDate − lookbackDays). */
export function worksheetCopyLookbackFromKey(workDate: Date, lookbackDays = WORKSHEET_COPY_LOOKBACK_DAYS): string {
  return DateTime.fromISO(formatWorkDateKey(workDate), { zone: "utc" }).minus({ days: lookbackDays }).toISODate()!;
}

/**
 * Rejects when the description exactly matches any of this employee's worksheets
 * from the previous {@link WORKSHEET_COPY_LOOKBACK_DAYS} calendar days.
 */
export async function assertWorksheetNotCopied(input: {
  employeeId: string;
  workDate: Date;
  workDescription: string;
  excludeWorksheetId?: string;
  db: WorksheetReader;
}): Promise<void> {
  const description = input.workDescription.trim();
  if (!description) return;

  const fromKey = worksheetCopyLookbackFromKey(input.workDate);

  const recent = await input.db.worksheet.findMany({
    where: {
      employeeId: input.employeeId,
      workDate: {
        gte: workDateFromKey(fromKey),
        lt: input.workDate
      },
      ...(input.excludeWorksheetId ? { id: { not: input.excludeWorksheetId } } : {})
    },
    select: { workDescription: true, workDate: true }
  });

  const match = recent.find((row) => isExactWorksheetCopy(description, row.workDescription));
  if (!match) return;

  throw new AppError(
    409,
    "WORKSHEET_COPIED",
    `This worksheet matches your description from ${formatWorkDateKey(match.workDate)}. Write a new description for today.`,
    { matchedWorkDate: formatWorkDateKey(match.workDate), lookbackDays: WORKSHEET_COPY_LOOKBACK_DAYS }
  );
}
