INSERT INTO "permissions" ("id", "code", "created_at")
VALUES
  (gen_random_uuid(), 'evaluation.view_own', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'evaluation.submit_own', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'evaluation.view_office', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'evaluation.review', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'evaluation.cycle.manage', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'evaluation.template.manage', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'evaluation.finalize', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code IN (
  'evaluation.view_own',
  'evaluation.submit_own',
  'evaluation.view_office',
  'evaluation.review',
  'evaluation.cycle.manage',
  'evaluation.template.manage',
  'evaluation.finalize'
)
WHERE r.name IN ('ORG_ADMIN', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code IN ('evaluation.view_office', 'evaluation.review')
WHERE r.name = 'OFFICE_ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p.code IN ('evaluation.view_own', 'evaluation.submit_own')
WHERE r.name = 'EMPLOYEE'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
