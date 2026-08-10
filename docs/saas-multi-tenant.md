# SaaS multi-tenancy notes

## Admin hierarchy

| Level | Role | Scope |
|-------|------|--------|
| Platform | `SUPER_ADMIN` | All organizations — creates companies + **company admins** |
| Company | `ORG_ADMIN` | One organization — all offices, creates offices/schedules, assigns **office admins** |
| Office | `OFFICE_ADMIN` | Assigned office(s) only — employees, attendance, leave, worksheets, reports (no office/schedule setup) |

```
SUPER_ADMIN
  └── Organization (company)
        ├── ORG_ADMIN  → all offices
        └── Office(s)
              └── OFFICE_ADMIN  → assigned offices only
                    └── EMPLOYEE
```

## Seed accounts

### Bootstrap (always)

- `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` → platform `SUPER_ADMIN`

### Demo fixture (`SEED_DEMO_DATA=true`, default in dev)

All demo users share `SEED_DEMO_PASSWORD` (default `Demo123!`) with `mustChangePassword: false`.

Fixture source: [prisma/seed/data/demo.fixture.json](../prisma/seed/data/demo.fixture.json)

After `npm run db:seed`, see **`prisma/seed/SEED_CREDENTIALS.md`** (gitignored).

Disable demo tenants in production: `SEED_DEMO_DATA=false`

## APIs

- Platform: `/api/v1/platform/*` — SuperAdmin only
- Company ops: `/api/v1/admin/*` — `ORG_ADMIN` (full org) or `OFFICE_ADMIN` (scoped by JWT `officeIds`)
- Office admin management: `POST /api/v1/admin/office-admins` — `ORG_ADMIN` + `office_admin.manage`
- Scoped dropdowns: `GET /api/v1/admin/context` — offices (filtered) + schedules for forms

## Employee login

Email login is globally unique. Employee-code login is unique per organization; send `organizationSlug` when codes collide across tenants.

## Apply migration + seed

```bash
npx prisma migrate deploy
npm run db:seed
```
