-- CreateEnum
CREATE TYPE "HolidaySource" AS ENUM ('KENAT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HolidayApplicationStatus" AS ENUM ('APPLIED', 'REVOKED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'HOLIDAY_ANNOUNCED';

-- CreateTable
CREATE TABLE "organization_holidays" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kenat_key" TEXT,
    "name_en" TEXT NOT NULL,
    "name_am" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gregorian_date" DATE NOT NULL,
    "ethiopian_year" INTEGER,
    "ethiopian_month" INTEGER,
    "ethiopian_day" INTEGER,
    "source" "HolidaySource" NOT NULL DEFAULT 'KENAT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "holiday_id" UUID NOT NULL,
    "applied_by_id" UUID NOT NULL,
    "all_offices" BOOLEAN NOT NULL DEFAULT true,
    "all_employees" BOOLEAN NOT NULL DEFAULT true,
    "notify_employees" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT,
    "status" "HolidayApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "assignment_count" INTEGER NOT NULL DEFAULT 0,
    "notified_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_application_targets" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "office_id" UUID,
    "employee_id" UUID,

    CONSTRAINT "holiday_application_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "holiday_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_holidays_organization_id_gregorian_date_idx" ON "organization_holidays"("organization_id", "gregorian_date");

-- CreateIndex
CREATE UNIQUE INDEX "organization_holidays_organization_id_kenat_key_gregorian_date_key" ON "organization_holidays"("organization_id", "kenat_key", "gregorian_date");

-- CreateIndex
CREATE INDEX "holiday_applications_organization_id_holiday_id_idx" ON "holiday_applications"("organization_id", "holiday_id");

-- CreateIndex
CREATE INDEX "holiday_applications_holiday_id_status_idx" ON "holiday_applications"("holiday_id", "status");

-- CreateIndex
CREATE INDEX "holiday_application_targets_application_id_idx" ON "holiday_application_targets"("application_id");

-- CreateIndex
CREATE INDEX "holiday_assignments_organization_id_work_date_idx" ON "holiday_assignments"("organization_id", "work_date");

-- CreateIndex
CREATE INDEX "holiday_assignments_employee_id_work_date_idx" ON "holiday_assignments"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "holiday_assignments_holiday_id_idx" ON "holiday_assignments"("holiday_id");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_assignments_employee_id_work_date_key" ON "holiday_assignments"("employee_id", "work_date");

-- AddForeignKey
ALTER TABLE "organization_holidays" ADD CONSTRAINT "organization_holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_applications" ADD CONSTRAINT "holiday_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_applications" ADD CONSTRAINT "holiday_applications_holiday_id_fkey" FOREIGN KEY ("holiday_id") REFERENCES "organization_holidays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_applications" ADD CONSTRAINT "holiday_applications_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_application_targets" ADD CONSTRAINT "holiday_application_targets_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "holiday_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_assignments" ADD CONSTRAINT "holiday_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_assignments" ADD CONSTRAINT "holiday_assignments_holiday_id_fkey" FOREIGN KEY ("holiday_id") REFERENCES "organization_holidays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_assignments" ADD CONSTRAINT "holiday_assignments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "holiday_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_assignments" ADD CONSTRAINT "holiday_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
