CREATE TYPE "SubscriptionAssigneeType" AS ENUM ('PERSON', 'TEAM', 'COMPANY');
CREATE TYPE "SubscriptionPeriodPaymentStatus" AS ENUM ('WAITING', 'PAID', 'CANCELLED');

ALTER TABLE "office_subscriptions"
  ADD COLUMN "assignee_type" "SubscriptionAssigneeType" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "employee_id" UUID,
  ADD COLUMN "department_id" UUID;

CREATE INDEX "office_subscriptions_employee_id_idx" ON "office_subscriptions"("employee_id");
CREATE INDEX "office_subscriptions_department_id_idx" ON "office_subscriptions"("department_id");

ALTER TABLE "office_subscriptions"
  ADD CONSTRAINT "office_subscriptions_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "office_subscriptions"
  ADD CONSTRAINT "office_subscriptions_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscription_periods"
  ADD COLUMN "payment_status" "SubscriptionPeriodPaymentStatus" NOT NULL DEFAULT 'WAITING';

UPDATE "subscription_periods"
SET "payment_status" = CASE WHEN "paid" = true THEN 'PAID'::"SubscriptionPeriodPaymentStatus" ELSE 'WAITING'::"SubscriptionPeriodPaymentStatus" END;

CREATE INDEX "subscription_periods_payment_status_idx" ON "subscription_periods"("payment_status");
