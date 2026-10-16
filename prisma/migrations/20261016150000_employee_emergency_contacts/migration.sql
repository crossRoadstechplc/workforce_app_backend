-- CreateTable
CREATE TABLE "employee_emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relation" "EmergencyContactRelation" NOT NULL,
    "relation_other" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- Migrate existing single emergency contact rows
INSERT INTO "employee_emergency_contacts" ("employee_id", "name", "phone", "relation", "relation_other", "sort_order")
SELECT
  "id",
  COALESCE(NULLIF(TRIM("emergency_contact_name"), ''), 'Emergency contact'),
  COALESCE(NULLIF(TRIM("emergency_contact_phone"), ''), '-'),
  COALESCE("emergency_contact_relation", 'OTHER'::"EmergencyContactRelation"),
  CASE
    WHEN "emergency_contact_relation" = 'OTHER'::"EmergencyContactRelation"
      THEN COALESCE(NULLIF(TRIM("emergency_contact_relation_other"), ''), 'Other')
    ELSE NULL
  END,
  0
FROM "employees"
WHERE
  NULLIF(TRIM(COALESCE("emergency_contact_name", '')), '') IS NOT NULL
  OR NULLIF(TRIM(COALESCE("emergency_contact_phone", '')), '') IS NOT NULL
  OR "emergency_contact_relation" IS NOT NULL;

-- CreateIndex
CREATE INDEX "employee_emergency_contacts_employee_id_sort_order_idx" ON "employee_emergency_contacts"("employee_id", "sort_order");

-- AddForeignKey
ALTER TABLE "employee_emergency_contacts"
  ADD CONSTRAINT "employee_emergency_contacts_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy columns
ALTER TABLE "employees" DROP COLUMN IF EXISTS "emergency_contact_name";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "emergency_contact_phone";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "emergency_contact_relation";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "emergency_contact_relation_other";
