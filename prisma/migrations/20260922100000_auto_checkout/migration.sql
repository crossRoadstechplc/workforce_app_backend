-- CreateEnum
CREATE TYPE "CheckOutSource" AS ENUM ('EMPLOYEE', 'SYSTEM', 'ADMIN');

-- AlterEnum
ALTER TYPE "AttendanceLocationSource" ADD VALUE 'SYSTEM';
ALTER TYPE "NotificationType" ADD VALUE 'CHECK_OUT_AUTO';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "attendance_auto_checkout_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "organizations" ADD COLUMN "attendance_auto_checkout_time" TEXT NOT NULL DEFAULT '22:00';

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN "check_out_source" "CheckOutSource";
