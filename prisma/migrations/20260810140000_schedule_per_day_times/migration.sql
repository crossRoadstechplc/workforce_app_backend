-- Per-day check-in / check-out for work schedules
CREATE TABLE "work_schedule_days" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "check_in_time" TEXT NOT NULL,
    "check_out_time" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_schedule_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_schedule_days_schedule_id_weekday_key" ON "work_schedule_days"("schedule_id", "weekday");
CREATE INDEX "work_schedule_days_schedule_id_idx" ON "work_schedule_days"("schedule_id");

ALTER TABLE "work_schedule_days"
  ADD CONSTRAINT "work_schedule_days_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one row per existing working day using the schedule-level times
INSERT INTO "work_schedule_days" ("id", "schedule_id", "weekday", "check_in_time", "check_out_time", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  ws."id",
  d.weekday,
  ws."check_in_time",
  ws."check_out_time",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "work_schedules" ws
CROSS JOIN LATERAL unnest(ws."working_days") AS d(weekday);
