-- CreateEnum values unchanged

CREATE TABLE IF NOT EXISTS "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

INSERT INTO "organizations" ("id", "name", "slug", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Default Organization', 'default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "organizations" WHERE "slug" = 'default');

CREATE TABLE IF NOT EXISTS "organization_memberships" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("user_id","organization_id")
);

CREATE TABLE IF NOT EXISTS "admin_offices" (
    "user_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_offices_pkey" PRIMARY KEY ("user_id","office_id")
);

-- Offices
ALTER TABLE "offices" ADD COLUMN IF NOT EXISTS "organization_id" UUID;
UPDATE "offices" o
SET "organization_id" = (SELECT id FROM "organizations" WHERE slug = 'default' LIMIT 1)
WHERE "organization_id" IS NULL;
ALTER TABLE "offices" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "offices_organization_id_name_key" ON "offices"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "offices_organization_id_is_active_idx" ON "offices"("organization_id", "is_active");

-- Work schedules
ALTER TABLE "work_schedules" ADD COLUMN IF NOT EXISTS "organization_id" UUID;
UPDATE "work_schedules"
SET "organization_id" = (SELECT id FROM "organizations" WHERE slug = 'default' LIMIT 1)
WHERE "organization_id" IS NULL;
ALTER TABLE "work_schedules" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "work_schedules" DROP CONSTRAINT IF EXISTS "work_schedules_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_organization_id_name_key" ON "work_schedules"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "work_schedules_organization_id_is_active_idx" ON "work_schedules"("organization_id", "is_active");

-- Leave types
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "organization_id" UUID;
UPDATE "leave_types"
SET "organization_id" = (SELECT id FROM "organizations" WHERE slug = 'default' LIMIT 1)
WHERE "organization_id" IS NULL;
ALTER TABLE "leave_types" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "leave_types" DROP CONSTRAINT IF EXISTS "leave_types_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_organization_id_name_key" ON "leave_types"("organization_id", "name");
CREATE INDEX IF NOT EXISTS "leave_types_organization_id_is_active_idx" ON "leave_types"("organization_id", "is_active");

-- Employees
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "organization_id" UUID;
UPDATE "employees"
SET "organization_id" = (SELECT id FROM "organizations" WHERE slug = 'default' LIMIT 1)
WHERE "organization_id" IS NULL;
ALTER TABLE "employees" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_employee_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "employees_organization_id_employee_code_key" ON "employees"("organization_id", "employee_code");
CREATE INDEX IF NOT EXISTS "employees_organization_id_status_idx" ON "employees"("organization_id", "status");

-- FKs
DO $$ BEGIN
  ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "admin_offices" ADD CONSTRAINT "admin_offices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "admin_offices" ADD CONSTRAINT "admin_offices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "offices" ADD CONSTRAINT "offices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");
CREATE INDEX IF NOT EXISTS "admin_offices_office_id_idx" ON "admin_offices"("office_id");

-- Backfill memberships for existing users that are not platform-only
INSERT INTO "organization_memberships" ("user_id", "organization_id", "created_at")
SELECT u.id, (SELECT id FROM "organizations" WHERE slug = 'default' LIMIT 1), CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "organization_memberships" m WHERE m.user_id = u.id
)
ON CONFLICT DO NOTHING;
