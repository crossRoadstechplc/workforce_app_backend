-- AlterTable
ALTER TABLE "organization_holidays"
  ADD COLUMN "linked_kenat_key" TEXT,
  ADD COLUMN "auto_apply" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "auto_notify" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auto_message" TEXT,
  ADD COLUMN "auto_office_id" UUID,
  ADD COLUMN "auto_all_employees" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auto_employee_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "auto_enabled_by_id" UUID,
  ADD COLUMN "auto_applied_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "organization_holidays_auto_apply_gregorian_date_auto_applied_at_idx"
  ON "organization_holidays"("auto_apply", "gregorian_date", "auto_applied_at");

-- AddForeignKey
ALTER TABLE "organization_holidays"
  ADD CONSTRAINT "organization_holidays_auto_enabled_by_id_fkey"
  FOREIGN KEY ("auto_enabled_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
