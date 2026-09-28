/** Same-day re-entry is allowed only after an employee checkout (not SYSTEM/ADMIN). */
export function canReCheckIn(timesheet: {
  isOpen: boolean;
  checkOutSource?: "EMPLOYEE" | "SYSTEM" | "ADMIN" | null;
}): boolean {
  return !timesheet.isOpen && timesheet.checkOutSource === "EMPLOYEE";
}

/** Closed days that must not be reopened (auto-checkout or admin correction). */
export function isDayPermanentlyClosed(timesheet: {
  isOpen: boolean;
  checkOutSource?: "EMPLOYEE" | "SYSTEM" | "ADMIN" | null;
}): boolean {
  return !timesheet.isOpen && (timesheet.checkOutSource === "SYSTEM" || timesheet.checkOutSource === "ADMIN");
}
