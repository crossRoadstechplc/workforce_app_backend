-- External meeting-booking API (API keys + webhooks).
-- ADDITIVE ONLY: new enums, new tables, new nullable columns. Existing rows are not modified
-- (existing bookings get source = 'APP' from the column default).

-- CreateEnum
CREATE TYPE "MeetingBookingSource" AS ENUM ('APP', 'API');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "meeting_bookings"
  ADD COLUMN "source" "MeetingBookingSource" NOT NULL DEFAULT 'APP',
  ADD COLUMN "integration_id" UUID,
  ADD COLUMN "external_id" TEXT,
  ADD COLUMN "cancel_reason" TEXT;

-- CreateTable
CREATE TABLE "api_integrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "office_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "webhook_url" TEXT,
    "webhook_secret_enc" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_integrations_key_hash_key" ON "api_integrations"("key_hash");

-- CreateIndex
CREATE INDEX "api_integrations_organization_id_is_active_idx" ON "api_integrations"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_integration_id_created_at_idx" ON "webhook_deliveries"("integration_id", "created_at");

-- CreateIndex (NULLs are distinct in PostgreSQL, so normal app bookings are unaffected)
CREATE UNIQUE INDEX "meeting_bookings_integration_id_external_id_key" ON "meeting_bookings"("integration_id", "external_id");

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "api_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_integrations" ADD CONSTRAINT "api_integrations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "api_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
