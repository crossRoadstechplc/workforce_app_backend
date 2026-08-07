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
