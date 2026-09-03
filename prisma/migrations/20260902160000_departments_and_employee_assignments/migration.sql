-- Create departments table
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_organization_id_name_key" ON "departments"("organization_id", "name");
CREATE INDEX "departments_organization_id_is_active_idx" ON "departments"("organization_id", "is_active");

ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate legacy free-text department values into department records
INSERT INTO "departments" ("id", "organization_id", "name", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), grouped."organization_id", grouped."name", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "organization_id", TRIM("department") AS "name"
    FROM "employees"
    WHERE "department" IS NOT NULL AND TRIM("department") <> ''
) AS grouped
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- Add new employee assignment columns
ALTER TABLE "employees" ADD COLUMN "department_id" UUID;
ALTER TABLE "employees" ADD COLUMN "evaluation_template_id" UUID;

UPDATE "employees" e
SET "department_id" = d."id"
FROM "departments" d
WHERE e."department" IS NOT NULL
  AND TRIM(e."department") <> ''
  AND d."organization_id" = e."organization_id"
  AND d."name" = TRIM(e."department");

ALTER TABLE "employees" DROP COLUMN "department";

CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");
CREATE INDEX "employees_evaluation_template_id_idx" ON "employees"("evaluation_template_id");

ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_evaluation_template_id_fkey" FOREIGN KEY ("evaluation_template_id") REFERENCES "evaluation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
