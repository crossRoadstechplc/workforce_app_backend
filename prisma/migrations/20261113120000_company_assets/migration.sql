-- CreateEnum
CREATE TYPE "CompanyAssetType" AS ENUM ('LAPTOP', 'DESKTOP', 'CAR', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyAssetStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'RETURNED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMPANY_ASSET_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'COMPANY_ASSET_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'COMPANY_ASSET_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'COMPANY_ASSET_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'COMPANY_ASSET_RETURNED';

-- CreateTable
CREATE TABLE "company_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "CompanyAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "notes" TEXT,
    "status" "CompanyAssetStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_by_user_id" UUID NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "response_note" TEXT,
    "returned_at" TIMESTAMPTZ(6),
    "returned_by_user_id" UUID,
    "return_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_assets_organization_id_status_idx" ON "company_assets"("organization_id", "status");
CREATE INDEX "company_assets_employee_id_status_idx" ON "company_assets"("employee_id", "status");
CREATE INDEX "company_assets_assigned_by_user_id_idx" ON "company_assets"("assigned_by_user_id");

-- AddForeignKey
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_returned_by_user_id_fkey" FOREIGN KEY ("returned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions for existing databases. New installs also receive these from the seed.
INSERT INTO "permissions" ("id", "code", "created_at")
SELECT gen_random_uuid(), code, CURRENT_TIMESTAMP
FROM (VALUES ('company_asset.manage'), ('company_asset.view_own'), ('company_asset.respond')) AS incoming(code)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p."code" = incoming.code);

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE (
  (r."name" IN ('ORG_ADMIN', 'OFFICE_ADMIN', 'SUPER_ADMIN') AND p."code" = 'company_asset.manage')
  OR (r."name" = 'EMPLOYEE' AND p."code" IN ('company_asset.view_own', 'company_asset.respond'))
)
ON CONFLICT DO NOTHING;
