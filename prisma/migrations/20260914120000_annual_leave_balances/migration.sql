CREATE TYPE "LeaveTypeCode" AS ENUM ('ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'OTHER');
CREATE TYPE "AnnualLeaveBucketStatus" AS ENUM ('OPEN', 'EXPIRED');
CREATE TYPE "AnnualLeaveLedgerType" AS ENUM ('GRANT', 'TOP_UP', 'RESERVE', 'RELEASE', 'CONSUME', 'EXPIRE', 'ADJUST');

ALTER TABLE "leave_types" ADD COLUMN "code" "LeaveTypeCode" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "leave_types" ADD COLUMN "tracks_balance" BOOLEAN NOT NULL DEFAULT false;

UPDATE "leave_types" SET "code" = 'ANNUAL', "tracks_balance" = true WHERE lower(name) = 'annual leave';
UPDATE "leave_types" SET "code" = 'SICK' WHERE lower(name) = 'sick leave';
UPDATE "leave_types" SET "code" = 'EMERGENCY' WHERE lower(name) = 'emergency leave';
UPDATE "leave_types" SET "code" = 'UNPAID' WHERE lower(name) = 'unpaid leave';
UPDATE "leave_types" SET "code" = 'OTHER' WHERE lower(name) = 'other leave';

CREATE TABLE "annual_leave_buckets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "service_years" INTEGER NOT NULL,
    "granted_days" DECIMAL(6,2) NOT NULL,
    "used_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pending_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "expired_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "AnnualLeaveBucketStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_leave_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "annual_leave_buckets_employee_id_period_start_key" ON "annual_leave_buckets"("employee_id", "period_start");
CREATE INDEX "annual_leave_buckets_employee_id_status_expires_on_idx" ON "annual_leave_buckets"("employee_id", "status", "expires_on");
CREATE INDEX "annual_leave_buckets_organization_id_idx" ON "annual_leave_buckets"("organization_id");

ALTER TABLE "annual_leave_buckets" ADD CONSTRAINT "annual_leave_buckets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annual_leave_buckets" ADD CONSTRAINT "annual_leave_buckets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "annual_leave_ledger" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "bucket_id" UUID NOT NULL,
    "leave_request_id" UUID,
    "type" "AnnualLeaveLedgerType" NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_leave_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "annual_leave_ledger_employee_id_created_at_idx" ON "annual_leave_ledger"("employee_id", "created_at");
CREATE INDEX "annual_leave_ledger_leave_request_id_idx" ON "annual_leave_ledger"("leave_request_id");
CREATE INDEX "annual_leave_ledger_bucket_id_idx" ON "annual_leave_ledger"("bucket_id");

ALTER TABLE "annual_leave_ledger" ADD CONSTRAINT "annual_leave_ledger_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annual_leave_ledger" ADD CONSTRAINT "annual_leave_ledger_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "annual_leave_buckets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annual_leave_ledger" ADD CONSTRAINT "annual_leave_ledger_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "leave_balance_allocations" (
    "leave_request_id" UUID NOT NULL,
    "bucket_id" UUID NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "leave_balance_allocations_pkey" PRIMARY KEY ("leave_request_id", "bucket_id")
);

CREATE INDEX "leave_balance_allocations_bucket_id_idx" ON "leave_balance_allocations"("bucket_id");

ALTER TABLE "leave_balance_allocations" ADD CONSTRAINT "leave_balance_allocations_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_balance_allocations" ADD CONSTRAINT "leave_balance_allocations_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "annual_leave_buckets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
