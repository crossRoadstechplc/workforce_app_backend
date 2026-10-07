-- AlterTable
ALTER TABLE "attendance_correctness_requests" ADD COLUMN "session" "LeaveDaySession" NOT NULL DEFAULT 'FULL';

-- DropIndex
DROP INDEX IF EXISTS "attendance_correctness_requests_employee_id_work_date_idx";

-- CreateIndex
CREATE INDEX "attendance_correctness_requests_employee_id_work_date_session_idx" ON "attendance_correctness_requests"("employee_id", "work_date", "session");
