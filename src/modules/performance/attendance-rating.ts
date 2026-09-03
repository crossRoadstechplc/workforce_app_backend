/** Reliability & Attendance auto-rating. Approved leave is zero-penalty. */

export type AttendanceRatingInput = {
  expectedDays: number;
  attendanceDays: number;
  lateDays: number;
  lateMinutes: number;
  missingCheckoutDays: number;
  approvedLeaveDays: number;
};

export type AttendanceDeduction = {
  reason: string;
  amount: number;
};

export type AttendanceRatingResult = {
  score: number;
  expectedDays: number;
  attendanceDays: number;
  lateDays: number;
  lateMinutes: number;
  missingCheckoutDays: number;
  approvedLeaveDays: number;
  unexcusedAbsentDays: number;
  lateRate: number;
  deductions: AttendanceDeduction[];
};

function clampScore(n: number) {
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Start at 5. Deduct for unexcused absence and lateness only.
 * Approved leave never reduces the score.
 */
export function rateReliabilityAttendance(input: AttendanceRatingInput): AttendanceRatingResult {
  const expectedDays = Math.max(0, input.expectedDays);
  const attendanceDays = Math.max(0, input.attendanceDays);
  const lateDays = Math.max(0, input.lateDays);
  const lateMinutes = Math.max(0, input.lateMinutes);
  const missingCheckoutDays = Math.max(0, input.missingCheckoutDays);
  const approvedLeaveDays = Math.max(0, input.approvedLeaveDays);

  const unexcusedAbsentDays = Math.max(0, expectedDays - attendanceDays - approvedLeaveDays);
  const lateRate = attendanceDays > 0 ? lateDays / attendanceDays : 0;

  const deductions: AttendanceDeduction[] = [];
  let penalty = 0;

  if (unexcusedAbsentDays > 0) {
    const amount = Math.min(3, unexcusedAbsentDays);
    penalty += amount;
    deductions.push({
      reason: `${unexcusedAbsentDays} unexcused absent day(s)`,
      amount
    });
  }

  if (lateRate >= 0.3) {
    penalty += 3;
    deductions.push({ reason: `Late on ${Math.round(lateRate * 100)}% of attended days`, amount: 3 });
  } else if (lateRate >= 0.15) {
    penalty += 2;
    deductions.push({ reason: `Late on ${Math.round(lateRate * 100)}% of attended days`, amount: 2 });
  } else if (lateRate >= 0.05) {
    penalty += 1;
    deductions.push({ reason: `Late on ${Math.round(lateRate * 100)}% of attended days`, amount: 1 });
  }

  if (missingCheckoutDays >= 3) {
    penalty += 1;
    deductions.push({ reason: `${missingCheckoutDays} missing checkout day(s)`, amount: 1 });
  }

  return {
    score: clampScore(5 - penalty),
    expectedDays,
    attendanceDays,
    lateDays,
    lateMinutes,
    missingCheckoutDays,
    approvedLeaveDays,
    unexcusedAbsentDays,
    lateRate: Math.round(lateRate * 1000) / 1000,
    deductions
  };
}

export function performanceBand(total: number | null | undefined): string | null {
  if (total == null || !Number.isFinite(total)) return null;
  if (total >= 45) return "OUTSTANDING";
  if (total >= 38) return "EXCEEDS_EXPECTATIONS";
  if (total >= 30) return "MEETS_EXPECTATIONS";
  if (total >= 20) return "NEEDS_IMPROVEMENT";
  return "UNSATISFACTORY";
}

export function performanceBandLabel(band: string | null | undefined): string | null {
  switch (band) {
    case "OUTSTANDING":
      return "Outstanding";
    case "EXCEEDS_EXPECTATIONS":
      return "Exceeds Expectations";
    case "MEETS_EXPECTATIONS":
      return "Meets Expectations";
    case "NEEDS_IMPROVEMENT":
      return "Needs Improvement";
    case "UNSATISFACTORY":
      return "Unsatisfactory";
    default:
      return null;
  }
}
