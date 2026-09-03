INSERT INTO "permissions" ("id", "code", "created_at")
SELECT gen_random_uuid(), 'department.manage', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'department.manage');

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('ORG_ADMIN', 'SUPER_ADMIN')
  AND p."code" = 'department.manage'
ON CONFLICT DO NOTHING;
