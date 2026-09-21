-- CreateEnum
CREATE TYPE "AttendanceReminderKind" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CHECK_IN_REMINDER';

-- CreateTable
CREATE TABLE "attendance_reminder_logs" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "kind" "AttendanceReminderKind" NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_reminder_logs_work_date_kind_idx" ON "attendance_reminder_logs"("work_date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_reminder_logs_employee_id_work_date_kind_key" ON "attendance_reminder_logs"("employee_id", "work_date", "kind");

-- AddForeignKey
ALTER TABLE "attendance_reminder_logs" ADD CONSTRAINT "attendance_reminder_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
