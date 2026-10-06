CREATE TYPE "LeaveDaySession" AS ENUM ('FULL', 'MORNING', 'AFTERNOON');

CREATE TABLE "leave_request_days" (
    "id" UUID NOT NULL,
    "leave_request_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "session" "LeaveDaySession" NOT NULL DEFAULT 'FULL',
    "day_fraction" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_request_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_request_days_leave_request_id_date_key" ON "leave_request_days"("leave_request_id", "date");
CREATE INDEX "leave_request_days_date_session_idx" ON "leave_request_days"("date", "session");

ALTER TABLE "leave_request_days" ADD CONSTRAINT "leave_request_days_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
