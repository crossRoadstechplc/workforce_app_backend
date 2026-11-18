/** Pure rules for the external meeting-booking API (no database access, unit tested). */

/** An empty office list means the key may use every office of its company. */
export function officeAllowed(allowedOfficeIds: string[], officeId: string) {
  return allowedOfficeIds.length === 0 || allowedOfficeIds.includes(officeId);
}

type ExternalIdComparable = { roomId: string; startsAt: Date; endsAt: Date; organizerEmployeeId: string | null };

/**
 * Same externalId sent again: when it describes the same booking, return the existing one (safe retry);
 * otherwise the caller reused an id for a different booking, which is a conflict.
 */
export function externalIdReplay(existing: ExternalIdComparable, incoming: ExternalIdComparable): "REUSE" | "CONFLICT" {
  const same =
    existing.roomId === incoming.roomId &&
    existing.startsAt.getTime() === incoming.startsAt.getTime() &&
    existing.endsAt.getTime() === incoming.endsAt.getTime() &&
    existing.organizerEmployeeId === incoming.organizerEmployeeId;
  return same ? "REUSE" : "CONFLICT";
}

/** Shape returned to the external app for one booking (API responses and webhook payloads). */
export type ExternalBookingSource = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  source: string;
  externalId: string | null;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  rescheduledAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  room: { id: string; name: string; location?: string | null };
  office: { id: string; name: string; timezone: string };
  organizer: { employeeCode: string; firstName: string; lastName: string } | null;
  integration?: { id: string; name: string } | null;
};

export function toExternalBooking(row: ExternalBookingSource) {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    externalId: row.externalId,
    title: row.title,
    notes: row.notes,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    room: { id: row.room.id, name: row.room.name, location: row.room.location ?? null },
    office: { id: row.office.id, name: row.office.name, timezone: row.office.timezone },
    employee: row.organizer
      ? { employeeCode: row.organizer.employeeCode, name: `${row.organizer.firstName} ${row.organizer.lastName}`.trim() }
      : null,
    createdAt: row.createdAt,
    rescheduledAt: row.rescheduledAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason
  };
}
