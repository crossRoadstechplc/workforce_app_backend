# Phases 5–7

## Phase 5 — History, calendar, corrections
Employee timesheet and worksheet history support calendar and paginated table views. Admin endpoints provide all-employee history, attendance correction with immutable correction records/audit logs, and worksheet review.

## Phase 6 — Leave
Employees can list leave types, submit non-overlapping leave requests, see history/summary, and cancel pending requests. Admins can list, inspect, approve, or reject pending requests. Rejection requires a reason. Approval is blocked when attendance already exists inside the requested date range. Working-day counts use the employee's configured schedule.

## Phase 7 — Notifications and Socket.IO
REST/database state remains authoritative. Socket.IO authenticates with the same access JWT and joins `user:{id}` and `role:{role}` rooms. Business mutations commit first, then realtime events and optional Firebase Cloud Messaging are delivered. Notification history is stored in PostgreSQL and device tokens are managed through REST.

### Main realtime events
Employee: `notification.created`, `attendance.checked_in`, `attendance.checked_out`, `attendance.corrected`, `worksheet.reviewed`, `leave.approved`, `leave.rejected`.
Admin: `employee.checked_in`, `employee.checked_in_late`, `employee.checked_out`, `leave.requested`, `leave.cancelled`, `leave.decision_updated`, `attendance.corrected`.

### Firebase
Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` to enable FCM. If omitted, database + Socket.IO notifications continue to work.
