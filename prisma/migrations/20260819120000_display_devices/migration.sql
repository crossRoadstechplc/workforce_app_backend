CREATE TYPE "DisplayBoardMode" AS ENUM ('ROOMS', 'PEOPLE', 'BOTH');

CREATE TABLE "display_devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "board_mode" "DisplayBoardMode" NOT NULL DEFAULT 'BOTH',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMPTZ(6),
    "refresh_token_hash" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "display_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "display_devices_refresh_token_hash_key" ON "display_devices"("refresh_token_hash");
CREATE INDEX "display_devices_pairing_code_hash_idx" ON "display_devices"("pairing_code_hash");
CREATE INDEX "display_devices_organization_id_office_id_idx" ON "display_devices"("organization_id", "office_id");
CREATE INDEX "display_devices_organization_id_is_active_idx" ON "display_devices"("organization_id", "is_active");

ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "created_at")
VALUES (gen_random_uuid(), 'display.manage', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code = 'display.manage'
WHERE r.name IN ('ORG_ADMIN', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
