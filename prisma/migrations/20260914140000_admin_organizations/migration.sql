CREATE TABLE "admin_organizations" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_organizations_pkey" PRIMARY KEY ("user_id","organization_id")
);

CREATE INDEX "admin_organizations_organization_id_idx" ON "admin_organizations"("organization_id");

ALTER TABLE "admin_organizations" ADD CONSTRAINT "admin_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_organizations" ADD CONSTRAINT "admin_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "admin_organizations" ("user_id", "organization_id", "created_at")
SELECT om."user_id", om."organization_id", om."created_at"
FROM "organization_memberships" om
INNER JOIN "user_roles" ur ON ur."user_id" = om."user_id"
INNER JOIN "roles" r ON r."id" = ur."role_id" AND r."name" IN ('ORG_ADMIN', 'ADMIN')
ON CONFLICT ("user_id", "organization_id") DO NOTHING;
