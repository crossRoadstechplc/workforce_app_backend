ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEETING_BOOKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEETING_RESCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEETING_CANCELLED';

CREATE TYPE "MeetingBookingStatus" AS ENUM ('BOOKED', 'CANCELLED');

CREATE TABLE "meeting_rooms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meeting_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meeting_rooms_office_id_name_key" ON "meeting_rooms"("office_id", "name");
CREATE INDEX "meeting_rooms_organization_id_office_id_is_active_idx" ON "meeting_rooms"("organization_id", "office_id", "is_active");
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "meeting_bookings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "booked_by_user_id" UUID NOT NULL,
    "organizer_employee_id" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "MeetingBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_user_id" UUID,
    "rescheduled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meeting_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meeting_bookings_room_id_starts_at_status_idx" ON "meeting_bookings"("room_id", "starts_at", "status");
CREATE INDEX "meeting_bookings_organization_id_office_id_starts_at_idx" ON "meeting_bookings"("organization_id", "office_id", "starts_at");
CREATE INDEX "meeting_bookings_booked_by_user_id_starts_at_idx" ON "meeting_bookings"("booked_by_user_id", "starts_at");
CREATE INDEX "meeting_bookings_status_starts_at_idx" ON "meeting_bookings"("status", "starts_at");
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "meeting_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_organizer_employee_id_fkey" FOREIGN KEY ("organizer_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "created_at")
VALUES
  (gen_random_uuid(), 'meeting.book', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting.view_own', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting.room.manage', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'meeting.manage', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code IN ('meeting.book', 'meeting.view_own', 'meeting.room.manage', 'meeting.manage')
WHERE r.name IN ('ORG_ADMIN', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code IN ('meeting.book', 'meeting.view_own')
WHERE r.name IN ('OFFICE_ADMIN', 'EMPLOYEE')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

