import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { meetingCore } from "../meetings/meeting.service.js";
import { externalIdReplay, officeAllowed, toExternalBooking } from "./meetings-api.logic.js";

export type IntegrationContext = {
  integrationId: string;
  organizationId: string;
  officeIds: string[];
  name: string;
};

function assertOfficeInScope(ctx: IntegrationContext, officeId: string) {
  if (!officeAllowed(ctx.officeIds, officeId)) {
    throw new AppError(403, "OFFICE_NOT_ALLOWED", "This API key is not allowed to use rooms in that office");
  }
}

async function findEmployee(ctx: IntegrationContext, employeeCode: string) {
  const employee = await prisma.employee.findFirst({
    where: { organizationId: ctx.organizationId, employeeCode: { equals: employeeCode.trim(), mode: "insensitive" } },
    select: {
      id: true,
      userId: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      status: true,
      office: { select: { id: true, name: true } },
      user: { select: { status: true } }
    }
  });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", `No employee with code ${employeeCode} in this company`);
  return employee;
}

function employeeIsActive(employee: { status: string; user: { status: string } }) {
  return employee.status === "ACTIVE" && employee.user.status === "ACTIVE";
}

/** Bookings an integration can read or change: only the ones it created. */
async function ownBooking(ctx: IntegrationContext, id: string) {
  const booking = await prisma.meetingBooking.findFirst({
    where: { id, organizationId: ctx.organizationId, integrationId: ctx.integrationId },
    include: meetingCore.bookingInclude
  });
  if (!booking) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  return booking;
}

export const meetingsApiService = {
  async listRooms(ctx: IntegrationContext, input: { page: number; pageSize: number; officeId?: string }) {
    if (input.officeId) assertOfficeInScope(ctx, input.officeId);
    const where: Prisma.MeetingRoomWhereInput = {
      organizationId: ctx.organizationId,
      isActive: true,
      ...(input.officeId ? { officeId: input.officeId } : ctx.officeIds.length ? { officeId: { in: ctx.officeIds } } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.meetingRoom.findMany({
        where,
        select: {
          id: true,
          name: true,
          location: true,
          capacity: true,
          amenities: true,
          office: { select: { id: true, name: true, timezone: true } }
        },
        orderBy: [{ office: { name: "asc" } }, { name: "asc" }],
        ...pagination(input)
      }),
      prisma.meetingRoom.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async availability(ctx: IntegrationContext, roomId: string, date: string) {
    const room = await meetingCore.loadRoom(ctx.organizationId, roomId);
    assertOfficeInScope(ctx, room.officeId);
    const { zone, bookings } = await meetingCore.roomDayBookings(room, date);
    return {
      room: {
        id: room.id,
        name: room.name,
        location: room.location,
        capacity: room.capacity,
        isActive: room.isActive,
        office: room.office
      },
      date,
      timezone: zone,
      busy: bookings.map((b) => {
        const mine = b.integrationId === ctx.integrationId;
        return { startsAt: b.startsAt, endsAt: b.endsAt, mine, bookingId: mine ? b.id : null, title: mine ? b.title : "Booked" };
      })
    };
  },

  async employee(ctx: IntegrationContext, employeeCode: string) {
    const employee = await findEmployee(ctx, employeeCode);
    return {
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      status: employeeIsActive(employee) ? "ACTIVE" : "INACTIVE",
      office: employee.office
    };
  },

  async createBooking(
    ctx: IntegrationContext,
    input: { employeeCode: string; roomId: string; title: string; notes?: string | null; startsAt: Date; endsAt: Date; externalId?: string }
  ) {
    const employee = await findEmployee(ctx, input.employeeCode);
    if (!employeeIsActive(employee)) throw new AppError(403, "EMPLOYEE_INACTIVE", `Employee ${employee.employeeCode} is not active`);

    if (input.externalId) {
      const existing = await prisma.meetingBooking.findFirst({
        where: { integrationId: ctx.integrationId, externalId: input.externalId },
        include: meetingCore.bookingInclude
      });
      if (existing) {
        const decision = externalIdReplay(existing, {
          roomId: input.roomId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          organizerEmployeeId: employee.id
        });
        if (decision === "REUSE") return { created: false, booking: toExternalBooking(existing) };
        throw new AppError(409, "EXTERNAL_ID_CONFLICT", "This externalId was already used for a different booking", { bookingId: existing.id });
      }
    }

    meetingCore.assertValidWindow(input.startsAt, input.endsAt);
    meetingCore.assertNotInPast(input.startsAt);
    const room = await meetingCore.loadRoom(ctx.organizationId, input.roomId);
    if (!room.isActive) throw new AppError(400, "ROOM_INACTIVE", "This meeting room is inactive");
    assertOfficeInScope(ctx, room.officeId);

    const booking = await meetingCore.createBookingCore({
      organizationId: ctx.organizationId,
      room,
      bookedByUserId: employee.userId,
      organizerEmployeeId: employee.id,
      title: input.title,
      notes: input.notes,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      actorUserId: null,
      via: { integrationId: ctx.integrationId, integrationName: ctx.name, externalId: input.externalId ?? null }
    });
    return { created: true, booking: toExternalBooking(booking) };
  },

  async listBookings(
    ctx: IntegrationContext,
    input: { page: number; pageSize: number; employeeCode?: string; status?: "BOOKED" | "CANCELLED"; from?: Date; to?: Date; externalId?: string }
  ) {
    const where: Prisma.MeetingBookingWhereInput = {
      organizationId: ctx.organizationId,
      integrationId: ctx.integrationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.externalId ? { externalId: input.externalId } : {}),
      ...(input.employeeCode ? { organizer: { employeeCode: { equals: input.employeeCode, mode: "insensitive" } } } : {}),
      ...(input.from || input.to
        ? { startsAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lt: input.to } : {}) } }
        : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.meetingBooking.findMany({ where, include: meetingCore.bookingInclude, orderBy: { startsAt: "asc" }, ...pagination(input) }),
      prisma.meetingBooking.count({ where })
    ]);
    return { items: items.map(toExternalBooking), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async getBooking(ctx: IntegrationContext, id: string) {
    return toExternalBooking(await ownBooking(ctx, id));
  },

  async reschedule(ctx: IntegrationContext, id: string, input: { startsAt?: Date; endsAt?: Date; roomId?: string; title?: string }) {
    const current = await ownBooking(ctx, id);
    if (input.startsAt) meetingCore.assertNotInPast(input.startsAt);
    const booking = await meetingCore.rescheduleCore(ctx.organizationId, current, input, {
      actorUserId: null,
      changedBy: "API",
      notifyBookerMessage: (title) => `${title} was moved via ${ctx.name}.`,
      auditReason: `Via API: ${ctx.name}`,
      assertRoomAllowed: (room) => assertOfficeInScope(ctx, room.officeId)
    });
    return toExternalBooking(booking);
  },

  async cancel(ctx: IntegrationContext, id: string, reason?: string) {
    const current = await ownBooking(ctx, id);
    if (current.status === "CANCELLED") return toExternalBooking(current);
    const booking = await meetingCore.cancelBookingCore(current, {
      organizationId: ctx.organizationId,
      cancelledByUserId: null,
      actorUserId: null,
      reason: reason ?? null,
      changedBy: "API",
      notifyBookerMessage: `${current.title} was cancelled via ${ctx.name}.`,
      emitToBooker: true,
      auditReason: `Via API: ${ctx.name}`
    });
    return toExternalBooking(booking);
  }
};
