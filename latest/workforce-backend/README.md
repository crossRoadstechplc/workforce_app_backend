# Workforce Backend — Phases 1 and 2

Foundation for PostgreSQL/Prisma and secure authentication.

## Included
- Express 5 + TypeScript structure
- PostgreSQL/PostGIS Docker service
- Prisma relational schema for users, roles, permissions, employees, offices, schedules, refresh tokens, audit logs
- Seeded ADMIN/EMPLOYEE roles and permissions
- Argon2id password hashing
- JWT access tokens and rotating refresh tokens
- Forced first-login password change with restricted access token
- Authentication and permission middleware
- Health endpoint, structured logging, request IDs, rate limiting, security headers

## Run
1. Copy `.env.example` to `.env` and replace secrets.
2. `docker compose up -d`
3. `npm install`
4. `npm run db:generate`
5. `npm run db:migrate -- --name init`
6. `npm run db:seed`
7. `npm run dev`

## Initial API
- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Important next work
Phase 3 adds admin employee creation, offices, schedules, audit writes, and temporary-password delivery.

## Phase 4 Attendance

Phase 4 adds PostGIS geofence validation, check-in preview, idempotent final check-in, required late reasons, checkout calculations, and transactional worksheet creation. See `docs-phase4.md`.

## Phases 5–7

This revision adds employee/admin timesheet and worksheet history, calendar endpoints, audited attendance corrections, worksheet reviews, leave request/approval/rejection/history/summary, persistent notifications, FCM device registration, Socket.IO authentication/rooms/events, and a schedulable missing-checkout scanner.

Run the missing-checkout scan from cron/platform scheduler:

```bash
npm run job:missing-checkouts
```

See `docs-phase5-7.md` for the phase-specific details.

## Phase 8 — Admin dashboard and reports

Dashboard:
- `GET /api/v1/admin/dashboard/today`
- `GET /api/v1/admin/dashboard/attendance-trend`
- `GET /api/v1/admin/dashboard/leave-summary`
- `GET /api/v1/admin/dashboard/recent-activity`

Reports:
- `GET /api/v1/admin/reports/timesheets`
- `GET /api/v1/admin/reports/worksheets`
- `GET /api/v1/admin/reports/leave`
- `GET /api/v1/admin/reports/employees/:employeeId`

Timesheet, worksheet, and leave reports accept `format=csv` for direct CSV exports.
See `docs-phase8.md` for filters and design notes.
