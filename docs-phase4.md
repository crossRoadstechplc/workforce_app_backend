# Phase 4: Attendance and Worksheet Core

## Endpoints

- `GET /api/v1/attendance/current`
- `POST /api/v1/attendance/check-in/preview`
- `POST /api/v1/attendance/check-in`
- `POST /api/v1/attendance/check-out`

## Core guarantees

- Server time is authoritative.
- PostGIS validates distance and radius.
- GPS accuracy is validated before attendance writes.
- Preview never creates attendance data.
- Final check-in revalidates all rules.
- Late check-in requires a reason.
- Check-in and checkout support UUID idempotency keys.
- Checkout, location capture, timesheet closure, and worksheet creation are one transaction.
- Schedule and office rules are snapshotted into each timesheet.
- Overnight schedules are supported.

## Migration note

After dependency installation:

```bash
npm run db:generate
npm run db:migrate -- --name phase4_attendance
```

## Request examples

### Preview

```json
{
  "latitude": 9.0105,
  "longitude": 38.7612,
  "accuracyMeters": 18,
  "capturedAt": "2026-08-06T14:35:00+03:00"
}
```

### Final check-in

```json
{
  "latitude": 9.0105,
  "longitude": 38.7612,
  "accuracyMeters": 18,
  "capturedAt": "2026-08-06T14:35:00+03:00",
  "idempotencyKey": "11111111-1111-4111-8111-111111111111",
  "lateReasonType": "TRAFFIC",
  "lateReasonDescription": "Heavy traffic near the office"
}
```

### Checkout

```json
{
  "latitude": 9.0105,
  "longitude": 38.7612,
  "accuracyMeters": 18,
  "capturedAt": "2026-08-06T17:30:00+03:00",
  "idempotencyKey": "22222222-2222-4222-8222-222222222222",
  "workDescription": "Completed attendance integration and verified the employee leave workflow."
}
```
