-- Separate attendance date range for Reliability/Attendance scoring (defaults to review period).
ALTER TABLE "evaluation_cycles"
  ADD COLUMN "attendance_period_start" DATE,
  ADD COLUMN "attendance_period_end" DATE;

UPDATE "evaluation_cycles"
SET
  "attendance_period_start" = "period_start",
  "attendance_period_end" = "period_end"
WHERE "attendance_period_start" IS NULL OR "attendance_period_end" IS NULL;

ALTER TABLE "evaluation_cycles"
  ALTER COLUMN "attendance_period_start" SET NOT NULL,
  ALTER COLUMN "attendance_period_end" SET NOT NULL;
