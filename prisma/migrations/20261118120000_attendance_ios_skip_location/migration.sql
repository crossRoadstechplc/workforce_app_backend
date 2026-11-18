-- iOS devices (native app + Safari/WebKit browsers) can be allowed to check in/out without location.
ALTER TYPE "AttendanceLocationSource" ADD VALUE IF NOT EXISTS 'IOS';

ALTER TABLE "organizations" ADD COLUMN "attendance_ios_skip_location" BOOLEAN NOT NULL DEFAULT false;
