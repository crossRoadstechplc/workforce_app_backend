CREATE TYPE "InviteType" AS ENUM ('ORG_ADMIN', 'OFFICE_ADMIN', 'EMPLOYEE');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "type" "InviteType" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "office_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "office_id" UUID,
    "schedule_id" UUID,
    "payload" JSONB,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "invited_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");
CREATE INDEX "invites_organization_id_status_idx" ON "invites"("organization_id", "status");
CREATE INDEX "invites_email_idx" ON "invites"("email");
CREATE INDEX "invites_user_id_idx" ON "invites"("user_id");
CREATE UNIQUE INDEX "invites_pending_org_email_type_key" ON "invites"("organization_id", "email", "type") WHERE "status" = 'PENDING';

ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
