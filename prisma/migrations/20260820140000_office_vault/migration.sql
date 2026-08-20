CREATE TYPE "VaultCredentialType" AS ENUM ('EMAIL', 'PASSWORD', 'WIFI', 'BANK', 'SOFTWARE', 'API_KEY', 'OTHER');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "SubscriptionBillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TABLE "vault_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID,
    "title" TEXT NOT NULL,
    "type" "VaultCredentialType" NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "secret_encrypted" TEXT NOT NULL,
    "last_revealed_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_credentials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vault_credentials_organization_id_idx" ON "vault_credentials"("organization_id");
CREATE INDEX "vault_credentials_office_id_idx" ON "vault_credentials"("office_id");
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "office_subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "category" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_cycle" "SubscriptionBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "renewal_day" INTEGER,
    "notes" TEXT,
    "login_credential_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "office_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "office_subscriptions_organization_id_status_idx" ON "office_subscriptions"("organization_id", "status");
CREATE INDEX "office_subscriptions_office_id_idx" ON "office_subscriptions"("office_id");
ALTER TABLE "office_subscriptions" ADD CONSTRAINT "office_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "office_subscriptions" ADD CONSTRAINT "office_subscriptions_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "office_subscriptions" ADD CONSTRAINT "office_subscriptions_login_credential_id_fkey" FOREIGN KEY ("login_credential_id") REFERENCES "vault_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "year_month" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_periods_subscription_id_year_month_key" ON "subscription_periods"("subscription_id", "year_month");
CREATE INDEX "subscription_periods_year_month_idx" ON "subscription_periods"("year_month");
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "office_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "created_at")
VALUES (gen_random_uuid(), 'vault.manage', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code = 'vault.manage'
WHERE r.name IN ('SUPER_ADMIN', 'ORG_ADMIN', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
