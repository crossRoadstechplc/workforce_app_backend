CREATE TYPE "AttendanceLocationSource" AS ENUM ('GPS', 'DESKTOP');

ALTER TABLE "organizations" ADD COLUMN "attendance_desktop_skip_location" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "attendance_locations" ADD COLUMN "source" "AttendanceLocationSource" NOT NULL DEFAULT 'GPS';

ALTER TABLE "attendance_locations" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "attendance_locations" ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "attendance_locations" ALTER COLUMN "accuracy_meters" DROP NOT NULL;
ALTER TABLE "attendance_locations" ALTER COLUMN "distance_from_office_meters" DROP NOT NULL;
ALTER TABLE "attendance_locations" ALTER COLUMN "captured_at" DROP NOT NULL;
