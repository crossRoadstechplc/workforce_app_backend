CREATE TYPE "AttendanceCorrectnessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTNESS_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTNESS_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTNESS_REJECTED';

CREATE TABLE "attendance_correctness_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "timesheet_id" UUID,
    "status" "AttendanceCorrectnessStatus" NOT NULL DEFAULT 'PENDING',
    "employee_note" TEXT,
    "admin_note" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_correctness_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_correctness_requests_organization_id_work_date_status_idx" ON "attendance_correctness_requests"("organization_id", "work_date", "status");
CREATE INDEX "attendance_correctness_requests_employee_id_work_date_idx" ON "attendance_correctness_requests"("employee_id", "work_date");
CREATE INDEX "attendance_correctness_requests_employee_id_status_idx" ON "attendance_correctness_requests"("employee_id", "status");

ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
