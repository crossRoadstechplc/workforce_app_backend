# Phase 8 — Admin Dashboard and Reports

## Dashboard endpoints

- `GET /api/v1/admin/dashboard/today?date=YYYY-MM-DD&officeId=...`
- `GET /api/v1/admin/dashboard/attendance-trend?from=YYYY-MM-DD&to=YYYY-MM-DD&officeId=...`
- `GET /api/v1/admin/dashboard/leave-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&officeId=...`
- `GET /api/v1/admin/dashboard/recent-activity?limit=20`

The daily dashboard returns total active employees, currently checked in, checked out, on-time, late, on approved leave, not checked in, missing checkout, submitted worksheets, and pending leave requests.

## Report endpoints

- `GET /api/v1/admin/reports/timesheets`
- `GET /api/v1/admin/reports/worksheets`
- `GET /api/v1/admin/reports/leave`
- `GET /api/v1/admin/reports/employees/:employeeId`

The first three support date range, employee, office, status, pagination, and `format=json|csv`.

CSV export is generated directly without adding a reporting dependency. JSON remains paginated. Keep CSV date ranges reasonably bounded in the client until a queued export worker is introduced for very large reports.

## Design rules

- PostgreSQL remains the source of truth.
- Dashboard totals are calculated from transactional tables instead of duplicated summary tables.
- No Redis/materialized views are required at this stage.
- New indexes support date, office, employee, status, worksheet, and leave reporting queries.
- `report.view` protects dashboard/report reads.
- `report.export` exists as a permission and should be checked by the web UI; backend export enforcement can be separated into its own route middleware if admins are later given different report/export roles.

## Export authorization and audit

CSV export requires both `report.view` and `report.export`. Every CSV generation writes a `REPORT_EXPORTED` audit entry containing the report type, filters, actor, IP address, user agent, and timestamp.
