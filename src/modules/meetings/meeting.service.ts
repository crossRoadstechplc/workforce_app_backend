import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { isOfficeAdmin, isOrgAdmin, type AuthContext } from "../../shared/tenancy.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOfficeDisplay, emitToOfficeStaff, emitToOrgAdmins, emitToUser } from "../../realtime/socket.server.js";
import type { MeetingBookingStatus, Prisma } from "../../generated/prisma/client.js";
import { webhookService, type WebhookChangedBy } from "../integrations/webhook.service.js";
import { toExternalBooking } from "../integrations/meetings-api.logic.js";

const roomInclude = {
  office: { select: { id: true, name: true, timezone: true } }
} as const;

const bookingInclude = {
  room: { select: { id: true, name: true, location: true, capacity: true, officeId: true } },
  office: { select: { id: true, name: true, timezone: true } },
  bookedBy: { select: { id: true, email: true } },
  organizer: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true } },
  integration: { select: { id: true, name: true } }
} as const;

type BookingRow = Prisma.MeetingBookingGetPayload<{ include: typeof bookingInclude }>;
type Db = Prisma.TransactionClient | typeof prisma;

const MIN_MINUTES = 15;
const MAX_MINUTES = 8 * 60;

function personName(p: { firstName: string; lastName: string } | null | undefined) {
  if (!p) return null;
  return `${p.firstName} ${p.lastName}`.trim();
}

function serializeRoom(row: { office: { id: string; name: string; timezone: string } } & Record<string, unknown>) {
  return row;
}

function serializeBooking(row: {
  organizer: { firstName: string; lastName: string } | null;
  bookedBy: { id: string; email: string };
} & Record<string, unknown>) {
  return {
    ...row,
    organizerName: personName(row.organizer) ?? row.bookedBy.email
  };
}

function emitMeetingChanged(organizationId: string, officeId: string, bookingId: string, bookedByUserId?: string) {
  const payload = { bookingId };
  emitToOrgAdmins(organizationId, "meeting.changed", payload);
  emitToOfficeStaff(organizationId, officeId, "meeting.changed", payload);
  if (bookedByUserId) emitToUser(bookedByUserId, "meeting.changed", payload);
}

async function orgAdminUserIds(organizationId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      adminOrganizations: { some: { organizationId } }
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

async function bookingActor(auth: AuthContext, opts?: { requireOffice?: boolean }) {
  if (!auth.organizationId) throw new AppError(403, "ORG_CONTEXT_REQUIRED", "Organization context is required");
  const employee = await prisma.employee.findUnique({
    where: { userId: auth.userId },
    select: { id: true, officeId: true, status: true, organizationId: true }
  });
  const allowedOfficeIds = isOrgAdmin(auth)
    ? null
    : isOfficeAdmin(auth)
      ? auth.officeIds ?? []
      : employee?.officeId
        ? [employee.officeId]
        : [];
  if (opts?.requireOffice !== false && allowedOfficeIds && !allowedOfficeIds.length) {
    throw new AppError(403, "NO_OFFICE_ASSIGNMENT", "You can only book rooms for your office");
  }
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    employee,
    allowedOfficeIds
  };
}

function assertCanBookOffice(allowedOfficeIds: string[] | null, officeId: string) {
  if (allowedOfficeIds && !allowedOfficeIds.includes(officeId)) {
    throw new AppError(403, "OFFICE_FORBIDDEN", "You can only book rooms at your office");
  }
}

function assertValidWindow(startsAt: Date, endsAt: Date) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new AppError(400, "INVALID_TIME", "Start and end times are required");
  }
  if (endsAt <= startsAt) throw new AppError(400, "INVALID_TIME", "End time must be after start time");
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (minutes < MIN_MINUTES) throw new AppError(400, "INVALID_DURATION", `Meetings must be at least ${MIN_MINUTES} minutes`);
  if (minutes > MAX_MINUTES) throw new AppError(400, "INVALID_DURATION", "Meetings cannot be longer than 8 hours");
}

function assertNotInPast(startsAt: Date) {
  if (startsAt.getTime() < Date.now() - 60_000) {
    throw new AppError(400, "PAST_SLOT", "You cannot book a time in the past");
  }
}

/**
 * Serialises bookings per room inside a transaction so two simultaneous requests
 * (e.g. an integration retrying quickly) cannot both pass the overlap check.
 */
async function lockRoomSlot(tx: Prisma.TransactionClient, roomId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${roomId}))) AS l`;
}

async function assertNoOverlap(roomId: string, startsAt: Date, endsAt: Date, excludeId?: string, db: Db = prisma) {
  const clash = await db.meetingBooking.findFirst({
    where: {
      roomId,
      status: "BOOKED",
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    },
    include: { bookedBy: { select: { email: true } } }
  });
  if (clash) {
    throw new AppError(409, "ROOM_UNAVAILABLE", "That room is already booked for this time", {
      startsAt: clash.startsAt,
      endsAt: clash.endsAt
    });
  }
}

async function loadRoom(organizationId: string, roomId: string) {
  const room = await prisma.meetingRoom.findFirst({
    where: { id: roomId, organizationId },
    include: roomInclude
  });
  if (!room) throw new AppError(404, "ROOM_NOT_FOUND", "Meeting room not found");
  return room;
}

type LoadedRoom = Awaited<ReturnType<typeof loadRoom>>;

/** Booked slots in a room for one local calendar day (office timezone). */
async function roomDayBookings(room: LoadedRoom, date: string) {
  const zone = room.office.timezone || "Africa/Addis_Ababa";
  const start = DateTime.fromISO(date, { zone }).startOf("day");
  if (!start.isValid) throw new AppError(400, "INVALID_DATE", "Date must be YYYY-MM-DD");
  const end = start.plus({ days: 1 });
  const bookings = await prisma.meetingBooking.findMany({
    where: {
      roomId: room.id,
      status: "BOOKED",
      startsAt: { lt: end.toUTC().toJSDate() },
      endsAt: { gt: start.toUTC().toJSDate() }
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, endsAt: true, bookedByUserId: true, integrationId: true }
  });
  return { zone, bookings };
}

type ViaIntegration = { integrationId: string; integrationName: string; externalId?: string | null };

async function createBookingCore(params: {
  organizationId: string;
  room: LoadedRoom;
  bookedByUserId: string;
  organizerEmployeeId: string | null;
  title: string;
  notes?: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Audit actor; null when the change came from an integration (no user session). */
  actorUserId: string | null;
  via?: ViaIntegration;
}) {
  const { room, via } = params;
  const created = await prisma.$transaction(async (tx) => {
    await lockRoomSlot(tx, room.id);
    await assertNoOverlap(room.id, params.startsAt, params.endsAt, undefined, tx);
    const booking = await tx.meetingBooking.create({
      data: {
        organizationId: params.organizationId,
        officeId: room.officeId,
        roomId: room.id,
        bookedByUserId: params.bookedByUserId,
        organizerEmployeeId: params.organizerEmployeeId,
        title: params.title,
        notes: params.notes ?? null,
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        source: via ? "API" : "APP",
        integrationId: via?.integrationId ?? null,
        externalId: via?.externalId ?? null
      },
      include: bookingInclude
    });
    await tx.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: "MEETING_BOOKED",
        entityType: "MeetingBooking",
        entityId: booking.id,
        newValues: auditJson({
          roomId: room.id,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          title: params.title,
          ...(via ? { source: "API", integrationId: via.integrationId, externalId: via.externalId ?? null, bookedForUserId: params.bookedByUserId } : {})
        }),
        reason: via ? `Via API: ${via.integrationName}` : undefined
      }
    });
    const summary = `${booking.title} · ${room.name} (${room.office.name})`;
    const admins = await orgAdminUserIds(params.organizationId);
    const notifications = await Promise.all(
      admins
        .filter((id) => id !== params.actorUserId && !(via && id === params.bookedByUserId))
        .map((userId) =>
          tx.notification.create({
            data: {
              userId,
              type: "MEETING_BOOKED",
              title: "Meeting booked",
              message: via ? `${summary} · via ${via.integrationName}` : summary,
              relatedEntityType: "MeetingBooking",
              relatedEntityId: booking.id
            }
          })
        )
    );
    if (via) {
      notifications.push(
        await tx.notification.create({
          data: {
            userId: params.bookedByUserId,
            type: "MEETING_BOOKED",
            title: "Meeting booked for you",
            message: `${summary} was booked via ${via.integrationName}.`,
            relatedEntityType: "MeetingBooking",
            relatedEntityId: booking.id
          }
        })
      );
    }
    const deliveryId = await webhookService.enqueue(tx, booking.integrationId, "booking.created", toExternalBooking(booking), via ? "API" : "EMPLOYEE");
    return { booking, notifications, deliveryId };
  });

  for (const n of created.notifications) await deliverNotification(n);
  emitToOrgAdmins(params.organizationId, "meeting.booked", { bookingId: created.booking.id });
  emitMeetingChanged(params.organizationId, created.booking.officeId, created.booking.id, params.bookedByUserId);
  emitToOfficeDisplay(params.organizationId, created.booking.officeId, "display.rooms_changed", { bookingId: created.booking.id });
  webhookService.deliverSoon([created.deliveryId]);
  return created.booking;
}

async function cancelBookingCore(
  current: BookingRow,
  params: {
    organizationId: string;
    /** FK to users; null when cancelled by an integration. */
    cancelledByUserId: string | null;
    actorUserId: string | null;
    reason?: string | null;
    changedBy: WebhookChangedBy;
    /** Notification to the booking owner, or null to skip (e.g. they cancelled it themselves). */
    notifyBookerMessage: string | null;
    emitToBooker: boolean;
    auditReason?: string;
    audit?: { ipAddress?: string; userAgent?: string };
  }
) {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.meetingBooking.update({
      where: { id: current.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: params.cancelledByUserId,
        cancelReason: params.reason ?? null
      },
      include: bookingInclude
    });
    await tx.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: "MEETING_CANCELLED",
        entityType: "MeetingBooking",
        entityId: current.id,
        oldValues: auditJson({ status: current.status }),
        newValues: auditJson({ status: "CANCELLED", ...(params.reason ? { reason: params.reason } : {}) }),
        reason: params.auditReason,
        ipAddress: params.audit?.ipAddress,
        userAgent: params.audit?.userAgent
      }
    });
    const notification = params.notifyBookerMessage
      ? await tx.notification.create({
          data: {
            userId: current.bookedByUserId,
            type: "MEETING_CANCELLED",
            title: "Meeting cancelled",
            message: params.notifyBookerMessage,
            relatedEntityType: "MeetingBooking",
            relatedEntityId: current.id
          }
        })
      : null;
    const deliveryId = await webhookService.enqueue(tx, current.integrationId, "booking.cancelled", toExternalBooking(booking), params.changedBy);
    return { booking, notification, deliveryId };
  });
  if (result.notification) await deliverNotification(result.notification);
  if (params.emitToBooker) emitToUser(current.bookedByUserId, "meeting.cancelled", { bookingId: current.id });
  emitToOrgAdmins(params.organizationId, "meeting.cancelled", { bookingId: current.id });
  emitMeetingChanged(params.organizationId, current.officeId, current.id, current.bookedByUserId);
  emitToOfficeDisplay(params.organizationId, current.officeId, "display.rooms_changed", { bookingId: current.id });
  webhookService.deliverSoon([result.deliveryId]);
  return result.booking;
}

async function rescheduleCore(
  organizationId: string,
  current: BookingRow,
  input: { startsAt?: Date; endsAt?: Date; roomId?: string; title?: string },
  params: {
    actorUserId: string | null;
    changedBy: WebhookChangedBy;
    notifyBookerMessage: (title: string) => string;
    auditReason?: string;
    audit?: { ipAddress?: string; userAgent?: string };
    /** Extra check for a newly chosen room (integration office scope). */
    assertRoomAllowed?: (room: LoadedRoom) => void;
  }
) {
  if (current.status !== "BOOKED") throw new AppError(409, "BOOKING_CANCELLED", "Cancelled bookings cannot be moved");
  const startsAt = input.startsAt ?? current.startsAt;
  const endsAt = input.endsAt ?? current.endsAt;
  assertValidWindow(startsAt, endsAt);

  let roomId = current.roomId;
  let officeId = current.officeId;
  if (input.roomId && input.roomId !== current.roomId) {
    const room = await loadRoom(organizationId, input.roomId);
    if (!room.isActive) throw new AppError(400, "ROOM_INACTIVE", "This meeting room is inactive");
    params.assertRoomAllowed?.(room);
    roomId = room.id;
    officeId = room.officeId;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await lockRoomSlot(tx, roomId);
    await assertNoOverlap(roomId, startsAt, endsAt, current.id, tx);
    const booking = await tx.meetingBooking.update({
      where: { id: current.id },
      data: {
        startsAt,
        endsAt,
        roomId,
        officeId,
        ...(input.title !== undefined ? { title: input.title } : {}),
        rescheduledAt: new Date()
      },
      include: bookingInclude
    });
    await tx.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: "MEETING_RESCHEDULED",
        entityType: "MeetingBooking",
        entityId: current.id,
        oldValues: auditJson({ startsAt: current.startsAt, endsAt: current.endsAt, roomId: current.roomId }),
        newValues: auditJson({ startsAt, endsAt, roomId }),
        reason: params.auditReason,
        ipAddress: params.audit?.ipAddress,
        userAgent: params.audit?.userAgent
      }
    });
    const n = await tx.notification.create({
      data: {
        userId: current.bookedByUserId,
        type: "MEETING_RESCHEDULED",
        title: "Meeting time changed",
        message: params.notifyBookerMessage(booking.title),
        relatedEntityType: "MeetingBooking",
        relatedEntityId: current.id
      }
    });
    const deliveryId = await webhookService.enqueue(tx, current.integrationId, "booking.rescheduled", toExternalBooking(booking), params.changedBy);
    return { booking, n, deliveryId };
  });
  await deliverNotification(updated.n);
  emitToUser(current.bookedByUserId, "meeting.rescheduled", { bookingId: current.id });
  emitMeetingChanged(organizationId, current.officeId, current.id, current.bookedByUserId);
  emitToOfficeDisplay(organizationId, current.officeId, "display.rooms_changed", { bookingId: current.id });
  if (updated.booking.officeId !== current.officeId) {
    emitMeetingChanged(organizationId, updated.booking.officeId, current.id, current.bookedByUserId);
    emitToOfficeDisplay(organizationId, updated.booking.officeId, "display.rooms_changed", { bookingId: current.id });
  }
  webhookService.deliverSoon([updated.deliveryId]);
  return updated.booking;
}

/** Shared booking rules, reused by the external integration API (src/modules/integrations). */
export const meetingCore = {
  bookingInclude,
  loadRoom,
  roomDayBookings,
  assertValidWindow,
  assertNotInPast,
  createBookingCore,
  cancelBookingCore,
  rescheduleCore
};

export const meetingService = {
  async listRoomsForBooker(auth: AuthContext, input: { page: number; pageSize: number; officeId?: string; isActive?: boolean }) {
    const actor = await bookingActor(auth, { requireOffice: false });
    if (actor.allowedOfficeIds && !actor.allowedOfficeIds.length) {
      return { items: [], meta: pageMeta(input.page, input.pageSize, 0) };
    }
    const officeFilter = input.officeId
      ? (assertCanBookOffice(actor.allowedOfficeIds, input.officeId), { officeId: input.officeId })
      : actor.allowedOfficeIds
        ? { officeId: { in: actor.allowedOfficeIds } }
        : {};
    const where: Prisma.MeetingRoomWhereInput = {
      organizationId: actor.organizationId,
      isActive: input.isActive ?? true,
      ...officeFilter
    };
    const [items, total] = await prisma.$transaction([
      prisma.meetingRoom.findMany({ where, include: roomInclude, orderBy: [{ office: { name: "asc" } }, { name: "asc" }], ...pagination(input) }),
      prisma.meetingRoom.count({ where })
    ]);
    return { items: items.map(serializeRoom), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async availability(auth: AuthContext, roomId: string, date: string) {
    const actor = await bookingActor(auth);
    const room = await loadRoom(actor.organizationId, roomId);
    assertCanBookOffice(actor.allowedOfficeIds, room.officeId);
    const { zone, bookings } = await roomDayBookings(room, date);
    return {
      room: serializeRoom(room),
      date,
      timezone: zone,
      busy: bookings.map((b) => ({
        id: b.id,
        title: b.bookedByUserId === actor.userId ? b.title : "Booked",
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        mine: b.bookedByUserId === actor.userId
      }))
    };
  },

  async myBookings(auth: AuthContext, input: { page: number; pageSize: number; status?: MeetingBookingStatus; from?: Date; to?: Date }) {
    const actor = await bookingActor(auth, { requireOffice: false });
    const where: Prisma.MeetingBookingWhereInput = {
      organizationId: actor.organizationId,
      bookedByUserId: actor.userId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.to
        ? { startsAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lt: input.to } : {}) } }
        : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.meetingBooking.findMany({
        where,
        include: bookingInclude,
        orderBy: { startsAt: "desc" },
        ...pagination(input)
      }),
      prisma.meetingBooking.count({ where })
    ]);
    return { items: items.map(serializeBooking), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async createBooking(auth: AuthContext, input: { roomId: string; title: string; notes?: string | null; startsAt: Date; endsAt: Date }) {
    const actor = await bookingActor(auth);
    assertValidWindow(input.startsAt, input.endsAt);
    assertNotInPast(input.startsAt);
    const room = await loadRoom(actor.organizationId, input.roomId);
    if (!room.isActive) throw new AppError(400, "ROOM_INACTIVE", "This meeting room is inactive");
    assertCanBookOffice(actor.allowedOfficeIds, room.officeId);

    const booking = await createBookingCore({
      organizationId: actor.organizationId,
      room,
      bookedByUserId: actor.userId,
      organizerEmployeeId: actor.employee?.id ?? null,
      title: input.title,
      notes: input.notes,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      actorUserId: actor.userId
    });
    return serializeBooking(booking);
  },

  async cancelOwn(auth: AuthContext, id: string) {
    const actor = await bookingActor(auth);
    const current = await prisma.meetingBooking.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: bookingInclude
    });
    if (!current) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
    if (current.bookedByUserId !== actor.userId) throw new AppError(403, "FORBIDDEN", "You can only cancel your own bookings");
    if (current.status === "CANCELLED") return serializeBooking(current);
    const updated = await cancelBookingCore(current, {
      organizationId: actor.organizationId,
      cancelledByUserId: actor.userId,
      actorUserId: actor.userId,
      changedBy: "EMPLOYEE",
      notifyBookerMessage: null,
      emitToBooker: false
    });
    return serializeBooking(updated);
  },

  async adminListRooms(organizationId: string, input: { page: number; pageSize: number; officeId?: string; isActive?: boolean }) {
    const where: Prisma.MeetingRoomWhereInput = {
      organizationId,
      ...(input.officeId ? { officeId: input.officeId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.meetingRoom.findMany({
        where,
        include: { ...roomInclude, _count: { select: { bookings: { where: { status: "BOOKED", startsAt: { gte: new Date() } } } } } },
        orderBy: [{ office: { name: "asc" } }, { name: "asc" }],
        ...pagination(input)
      }),
      prisma.meetingRoom.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async createRoom(
    organizationId: string,
    input: { officeId: string; name: string; location?: string | null; capacity: number; amenities?: string[] },
    audit: AuditContext
  ) {
    const office = await prisma.office.findFirst({ where: { id: input.officeId, organizationId } });
    if (!office) throw new AppError(400, "INVALID_OFFICE", "Office does not exist in this company");
    const existing = await prisma.meetingRoom.findFirst({ where: { officeId: input.officeId, name: input.name } });
    if (existing) throw new AppError(409, "ROOM_EXISTS", "A room with this name already exists in that office");
    const room = await prisma.meetingRoom.create({
      data: {
        organizationId,
        officeId: input.officeId,
        name: input.name,
        location: input.location ?? null,
        capacity: input.capacity,
        amenities: input.amenities ?? []
      },
      include: roomInclude
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "MEETING_ROOM_CREATED",
        entityType: "MeetingRoom",
        entityId: room.id,
        newValues: auditJson({ name: room.name, officeId: room.officeId }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return room;
  },

  async updateRoom(
    organizationId: string,
    id: string,
    input: { name?: string; location?: string | null; capacity?: number; amenities?: string[]; isActive?: boolean },
    audit: AuditContext
  ) {
    const current = await loadRoom(organizationId, id);
    if (input.name && input.name !== current.name) {
      const clash = await prisma.meetingRoom.findFirst({ where: { officeId: current.officeId, name: input.name, id: { not: id } } });
      if (clash) throw new AppError(409, "ROOM_EXISTS", "A room with this name already exists in that office");
    }
    const updated = await prisma.meetingRoom.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.amenities !== undefined ? { amenities: input.amenities } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      },
      include: roomInclude
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "MEETING_ROOM_UPDATED",
        entityType: "MeetingRoom",
        entityId: id,
        oldValues: auditJson({ name: current.name, isActive: current.isActive }),
        newValues: auditJson({ name: updated.name, isActive: updated.isActive }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return updated;
  },

  async adminListBookings(
    organizationId: string,
    input: {
      page: number;
      pageSize: number;
      officeId?: string;
      roomId?: string;
      status?: MeetingBookingStatus;
      from?: Date;
      to?: Date;
      search?: string;
    }
  ) {
    const where: Prisma.MeetingBookingWhereInput = {
      organizationId,
      ...(input.officeId ? { officeId: input.officeId } : {}),
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(input.status ? { status: input.status } : { status: "BOOKED" }),
      ...(input.from || input.to
        ? { startsAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lt: input.to } : {}) } }
        : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { bookedBy: { email: { contains: input.search, mode: "insensitive" } } },
              { organizer: { firstName: { contains: input.search, mode: "insensitive" } } },
              { organizer: { lastName: { contains: input.search, mode: "insensitive" } } },
              { organizer: { employeeCode: { contains: input.search, mode: "insensitive" } } },
              { integration: { name: { contains: input.search, mode: "insensitive" } } },
              { externalId: { contains: input.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const now = new Date();
    const [items, total, upcoming, todayCount] = await prisma.$transaction([
      prisma.meetingBooking.findMany({
        where,
        include: bookingInclude,
        orderBy: { startsAt: "asc" },
        ...pagination(input)
      }),
      prisma.meetingBooking.count({ where }),
      prisma.meetingBooking.count({ where: { organizationId, status: "BOOKED", startsAt: { gte: now } } }),
      prisma.meetingBooking.count({
        where: {
          organizationId,
          status: "BOOKED",
          startsAt: { gte: DateTime.now().startOf("day").toUTC().toJSDate(), lt: DateTime.now().plus({ days: 1 }).startOf("day").toUTC().toJSDate() }
        }
      })
    ]);
    return {
      items: items.map(serializeBooking),
      meta: pageMeta(input.page, input.pageSize, total),
      counts: { upcoming, today: todayCount, total }
    };
  },

  async reschedule(
    organizationId: string,
    userId: string,
    id: string,
    input: { startsAt?: Date; endsAt?: Date; roomId?: string; title?: string },
    audit: AuditContext
  ) {
    const current = await prisma.meetingBooking.findFirst({
      where: { id, organizationId },
      include: bookingInclude
    });
    if (!current) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
    const booking = await rescheduleCore(organizationId, current, input, {
      actorUserId: audit.actorUserId,
      changedBy: "ADMIN",
      notifyBookerMessage: (title) => `${title} was moved by your company admin.`,
      audit
    });
    return serializeBooking(booking);
  },

  async adminCancel(organizationId: string, userId: string, id: string, audit: AuditContext) {
    const current = await prisma.meetingBooking.findFirst({
      where: { id, organizationId },
      include: bookingInclude
    });
    if (!current) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
    if (current.status === "CANCELLED") return serializeBooking(current);
    const booking = await cancelBookingCore(current, {
      organizationId,
      cancelledByUserId: userId,
      actorUserId: audit.actorUserId,
      changedBy: "ADMIN",
      notifyBookerMessage: `${current.title} was cancelled by your company admin.`,
      emitToBooker: true,
      audit
    });
    return serializeBooking(booking);
  }
};
