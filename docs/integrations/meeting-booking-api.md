# Workforce Meeting Booking API

Book meeting rooms for employees using their **employee code** (e.g. `SPX001`).

## Basics

| | |
|---|---|
| Base URL | `https://<workforce-api-host>/api/v1/integrations/meetings` |
| Auth header | `X-API-Key: wfk_live_…` (keep it on your server) |
| Body | JSON, `Content-Type: application/json` |
| Times | ISO 8601 **with offset**, e.g. `2026-11-20T10:00:00+03:00`. Responses are UTC. |
| Limit | 60 requests/minute per key |

Every success response is `{ "data": … }`. Every error is:

```json
{ "error": { "code": "ROOM_UNAVAILABLE", "message": "That room is already booked for this time", "details": {}, "requestId": "…" } }
```

---

## 1. List rooms

```
GET /rooms?page=1&pageSize=20          (optional: officeId)
```

```json
{
  "data": {
    "items": [
      {
        "id": "8b0c0f52-…",
        "name": "Board room",
        "location": "2nd floor",
        "capacity": 10,
        "amenities": ["TV"],
        "office": { "id": "…", "name": "HQ", "timezone": "Africa/Addis_Ababa" }
      }
    ],
    "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
  }
}
```

## 2. Room availability

```
GET /rooms/{roomId}/availability?date=2026-11-20
```

Returns the **busy** slots for that day (office time zone).

```json
{
  "data": {
    "date": "2026-11-20",
    "timezone": "Africa/Addis_Ababa",
    "busy": [
      { "startsAt": "2026-11-20T06:00:00.000Z", "endsAt": "2026-11-20T07:00:00.000Z", "mine": false, "bookingId": null, "title": "Booked" }
    ]
  }
}
```

## 3. Check employee (optional)

```
GET /employees/SPX001
```

```json
{ "data": { "employeeCode": "SPX001", "name": "Abebe Kebede", "status": "ACTIVE", "office": { "id": "…", "name": "HQ" } } }
```

## 4. Create booking

```
POST /bookings
```

```json
{
  "employeeCode": "SPX001",
  "roomId": "8b0c0f52-…",
  "title": "Client meeting",
  "notes": "Contract review",
  "startsAt": "2026-11-20T10:00:00+03:00",
  "endsAt": "2026-11-20T11:00:00+03:00",
  "externalId": "SPX-REQ-12345"
}
```

- **Required:** `employeeCode`, `roomId`, `title` (2–200 chars), `startsAt`, `endsAt`.
- **Optional:** `notes` (up to 2000 chars) and `externalId` (your own ID).
- **Duration:** 15 minutes to 8 hours, and not in the past.

**`201 Created`** returns the booking object:

```json
{
  "data": {
    "id": "c1d2…",
    "status": "BOOKED",
    "source": "API",
    "externalId": "SPX-REQ-12345",
    "title": "Client meeting",
    "notes": "Contract review",
    "startsAt": "2026-11-20T07:00:00.000Z",
    "endsAt": "2026-11-20T08:00:00.000Z",
    "room": { "id": "8b0c…", "name": "Board room", "location": "2nd floor" },
    "office": { "id": "…", "name": "HQ", "timezone": "Africa/Addis_Ababa" },
    "employee": { "employeeCode": "SPX001", "name": "Abebe Kebede" },
    "createdAt": "2026-11-19T09:12:00.000Z",
    "rescheduledAt": null,
    "cancelledAt": null,
    "cancelReason": null
  }
}
```

> **Safe retry:** sending the same `externalId` again returns the original booking with `200` instead of creating a duplicate. Sending the same `externalId` with a different employee, room or time returns `409 EXTERNAL_ID_CONFLICT`.

## 5. List your bookings

```
GET /bookings?employeeCode=SPX001&status=BOOKED&from=2026-11-01T00:00:00+03:00&to=2026-12-01T00:00:00+03:00
```

All filters are optional. Also accepts `externalId`, `page` and `pageSize`. Only bookings made with your key are returned.

```json
{ "data": { "items": [ /* booking objects */ ], "meta": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 } } }
```

## 6. Get one booking

```
GET /bookings/{id}
```

Returns the booking object.

## 7. Reschedule

```
PATCH /bookings/{id}
```

```json
{ "startsAt": "2026-11-20T14:00:00+03:00", "endsAt": "2026-11-20T15:00:00+03:00" }
```

Send any of `startsAt`, `endsAt`, `roomId`, `title`. Returns the updated booking object.

## 8. Cancel

```
POST /bookings/{id}/cancel
```

```json
{ "reason": "Client postponed" }
```

Returns the booking object with `"status": "CANCELLED"`.

---

## Errors

| HTTP | `code` |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_TIME`, `INVALID_DURATION`, `PAST_SLOT`, `INVALID_DATE`, `ROOM_INACTIVE` |
| 401 | `API_KEY_REQUIRED`, `INVALID_API_KEY`, `API_KEY_REVOKED` |
| 403 | `API_KEY_DISABLED`, `OFFICE_NOT_ALLOWED`, `EMPLOYEE_INACTIVE` |
| 404 | `EMPLOYEE_NOT_FOUND`, `ROOM_NOT_FOUND`, `BOOKING_NOT_FOUND` |
| 409 | `ROOM_UNAVAILABLE` (slot taken), `BOOKING_CANCELLED`, `EXTERNAL_ID_CONFLICT` |
| 429 | `RATE_LIMITED` |

---

## Webhooks (optional)

If the admin sets a webhook URL, Workforce sends a `POST` there when a booking **made by your key** changes, whoever changed it:

```
X-Workforce-Event: booking.cancelled
X-Workforce-Delivery: 5e0b…
X-Workforce-Signature: t=1763630000,v1=4f9c…
```

```json
{
  "id": "5e0b…",
  "event": "booking.cancelled",
  "occurredAt": "2026-11-19T10:00:00.000Z",
  "changedBy": "ADMIN",
  "data": { /* booking object */ }
}
```

- **Events:** `booking.created`, `booking.rescheduled`, `booking.cancelled`, and `ping` (a test the admin can send).
- **`changedBy`:** `API` (your app), `ADMIN` (a company admin) or `EMPLOYEE` (the employee).
- **Reply** with any `2xx` within 10 seconds, or the event is retried (up to 6 attempts).
- **Duplicates:** ignore any `X-Workforce-Delivery` ID you've already processed.

**To verify the signature:** compute HMAC-SHA256 of `"<t>.<raw body>"` with your webhook secret (`whsec_…`). The hex result must equal `v1`, and `t` must be within 5 minutes of now.

```js
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest("hex");
const valid = expected === v1 && Math.abs(Date.now() / 1000 - Number(t)) < 300;
```
