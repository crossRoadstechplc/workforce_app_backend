import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { isOfficeAdmin, isOrgAdmin, ROLE, type AuthContext } from "../../shared/tenancy.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgRole, emitToUser } from "../../realtime/socket.server.js";
import type { MeetingBookingStatus, Prisma } from "../../generated/prisma/client.js";

const roomInclude = {
  office: { select: { id: true, name: true, timezone: true } }
} as const;

const bookingInclude = {
  room: { select: { id: true, name: true, location: true, capacity: true, officeId: true } },
  office: { select: { id: true, name: true, timezone: true } },
  bookedBy: { select: { id: true, email: true } },
  organizer: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true } }
} as const;

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

async function orgAdminUserIds(organizationId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      memberships: { some: { organizationId } },
      userRoles: { some: { role: { name: { in: [ROLE.ORG_ADMIN, "ADMIN"] } } } }
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

async function bookingActor(auth: AuthContext) {
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
  if (allowedOfficeIds && !allowedOfficeIds.length) {
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

async function assertNoOverlap(roomId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
  const clash = await prisma.meetingBooking.findFirst({
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

export const meetingService = {
  async listRoomsForBooker(auth: AuthContext, input: { page: number; pageSize: number; officeId?: string; isActive?: boolean }) {
    const actor = await bookingActor(auth);
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
    const zone = room.office.timezone || "Africa/Addis_Ababa";
    const start = DateTime.fromISO(date, { zone }).startOf("day");
    if (!start.isValid) throw new AppError(400, "INVALID_DATE", "Date must be YYYY-MM-DD");
    const end = start.plus({ days: 1 });
    const bookings = await prisma.meetingBooking.findMany({
      where: {
        roomId,
        status: "BOOKED",
        startsAt: { lt: end.toUTC().toJSDate() },
        endsAt: { gt: start.toUTC().toJSDate() }
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, endsAt: true, bookedByUserId: true }
    });
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
    const actor = await bookingActor(auth);
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
    if (input.startsAt.getTime() < Date.now() - 60_000) {
      throw new AppError(400, "PAST_SLOT", "You cannot book a time in the past");
    }
    const room = await loadRoom(actor.organizationId, input.roomId);
    if (!room.isActive) throw new AppError(400, "ROOM_INACTIVE", "This meeting room is inactive");
    assertCanBookOffice(actor.allowedOfficeIds, room.officeId);
    await assertNoOverlap(room.id, input.startsAt, input.endsAt);

    const created = await prisma.$transaction(async (tx) => {
      const booking = await tx.meetingBooking.create({
        data: {
          organizationId: actor.organizationId,
          officeId: room.officeId,
          roomId: room.id,
          bookedByUserId: actor.userId,
          organizerEmployeeId: actor.employee?.id ?? null,
          title: input.title,
          notes: input.notes ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt
        },
        include: bookingInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "MEETING_BOOKED",
          entityType: "MeetingBooking",
          entityId: booking.id,
          newValues: auditJson({ roomId: room.id, startsAt: input.startsAt, endsAt: input.endsAt, title: input.title })
        }
      });
      const admins = await orgAdminUserIds(actor.organizationId);
      const notifications = await Promise.all(
        admins.filter((id) => id !== actor.userId).map((userId) =>
          tx.notification.create({
            data: {
              userId,
              type: "MEETING_BOOKED",
              title: "Meeting booked",
              message: `${booking.title} · ${room.name} (${room.office.name})`,
              relatedEntityType: "MeetingBooking",
              relatedEntityId: booking.id
            }
          })
        )
      );
      return { booking, notifications };
    });

    for (const n of created.notifications) await deliverNotification(n);
    emitToOrgRole(actor.organizationId, ROLE.ORG_ADMIN, "meeting.booked", { bookingId: created.booking.id });
    return serializeBooking(created.booking);
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
    const updated = await prisma.meetingBooking.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actor.userId },
      include: bookingInclude
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "MEETING_CANCELLED",
        entityType: "MeetingBooking",
        entityId: id,
        oldValues: auditJson({ status: current.status }),
        newValues: auditJson({ status: "CANCELLED" })
      }
    });
    emitToOrgRole(actor.organizationId, ROLE.ORG_ADMIN, "meeting.cancelled", { bookingId: id });
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
              { organizer: { lastName: { contains: input.search, mode: "insensitive" } } }
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
    if (current.status !== "BOOKED") throw new AppError(409, "BOOKING_CANCELLED", "Cancelled bookings cannot be moved");

    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    assertValidWindow(startsAt, endsAt);

    let roomId = current.roomId;
    let officeId = current.officeId;
    if (input.roomId && input.roomId !== current.roomId) {
      const room = await loadRoom(organizationId, input.roomId);
      if (!room.isActive) throw new AppError(400, "ROOM_INACTIVE", "This meeting room is inactive");
      roomId = room.id;
      officeId = room.officeId;
    }

    await assertNoOverlap(roomId, startsAt, endsAt, id);
    const updated = await prisma.$transaction(async (tx) => {
      const booking = await tx.meetingBooking.update({
        where: { id },
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
          actorUserId: audit.actorUserId,
          action: "MEETING_RESCHEDULED",
          entityType: "MeetingBooking",
          entityId: id,
          oldValues: auditJson({ startsAt: current.startsAt, endsAt: current.endsAt, roomId: current.roomId }),
          newValues: auditJson({ startsAt, endsAt, roomId }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.bookedByUserId,
          type: "MEETING_RESCHEDULED",
          title: "Meeting time changed",
          message: `${booking.title} was moved by your company admin.`,
          relatedEntityType: "MeetingBooking",
          relatedEntityId: id
        }
      });
      return { booking, n };
    });
    await deliverNotification(updated.n);
    emitToUser(current.bookedByUserId, "meeting.rescheduled", { bookingId: id });
    return serializeBooking(updated.booking);
  },

  async adminCancel(organizationId: string, userId: string, id: string, audit: AuditContext) {
    const current = await prisma.meetingBooking.findFirst({
      where: { id, organizationId },
      include: bookingInclude
    });
    if (!current) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
    if (current.status === "CANCELLED") return serializeBooking(current);
    const updated = await prisma.$transaction(async (tx) => {
      const booking = await tx.meetingBooking.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: userId },
        include: bookingInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "MEETING_CANCELLED",
          entityType: "MeetingBooking",
          entityId: id,
          oldValues: auditJson({ status: current.status }),
          newValues: auditJson({ status: "CANCELLED" }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.bookedByUserId,
          type: "MEETING_CANCELLED",
          title: "Meeting cancelled",
          message: `${current.title} was cancelled by your company admin.`,
          relatedEntityType: "MeetingBooking",
          relatedEntityId: id
        }
      });
      return { booking, n };
    });
    await deliverNotification(updated.n);
    emitToUser(current.bookedByUserId, "meeting.cancelled", { bookingId: id });
    return serializeBooking(updated.booking);
  }
};
