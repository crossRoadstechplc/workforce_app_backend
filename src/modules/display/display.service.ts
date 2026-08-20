import { randomInt } from "node:crypto";
import { DateTime } from "luxon";
import type { DisplayBoardMode } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import {
  hashToken,
  signDisplayAccessToken,
  signDisplayRefreshToken,
  verifyDisplayRefreshToken
} from "../auth/token.service.js";
import { rosterService } from "../history/roster.service.js";

const PAIRING_TTL_MINUTES = 10;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const SOON_MINUTES = 30;

const deviceInclude = {
  office: { select: { id: true, name: true, timezone: true } },
  organization: { select: { id: true, name: true } }
} as const;

function wallName(first?: string | null, last?: string | null) {
  const given = (first ?? "").trim();
  const initial = (last ?? "").trim().charAt(0);
  if (!given && !initial) return "Booked";
  return initial ? `${given} ${initial}.`.trim() : given;
}

function publicPerson(firstName: string, lastName: string, department: string | null) {
  return {
    name: wallName(firstName, lastName),
    department: department?.trim() || null
  };
}

async function issueSession(device: {
  id: string;
  name: string;
  organizationId: string;
  officeId: string;
  boardMode: DisplayBoardMode;
  office: { id: string; name: string; timezone: string };
  organization: { id: string; name: string };
}) {
  const accessToken = await signDisplayAccessToken({
    displayId: device.id,
    organizationId: device.organizationId,
    officeId: device.officeId,
    boardMode: device.boardMode
  });
  const refreshToken = await signDisplayRefreshToken(device.id);
  await prisma.displayDevice.update({
    where: { id: device.id },
    data: {
      refreshTokenHash: hashToken(refreshToken),
      pairingCodeHash: null,
      pairingExpiresAt: null,
      lastSeenAt: new Date()
    }
  });
  return {
    accessToken,
    refreshToken,
    display: {
      id: device.id,
      name: device.name,
      boardMode: device.boardMode,
      officeId: device.office.id,
      officeName: device.office.name,
      timezone: device.office.timezone,
      organizationName: device.organization.name
    }
  };
}

async function uniquePairingCode() {
  for (let i = 0; i < 12; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hash = hashToken(code);
    const clash = await prisma.displayDevice.findFirst({
      where: { pairingCodeHash: hash, pairingExpiresAt: { gt: new Date() } }
    });
    if (!clash) return { code, hash };
  }
  throw new AppError(500, "PAIRING_CODE_FAILED", "Could not generate a pairing code");
}

async function setPairingCode(id: string) {
  const { code, hash } = await uniquePairingCode();
  const pairingExpiresAt = DateTime.now().plus({ minutes: PAIRING_TTL_MINUTES }).toJSDate();
  await prisma.displayDevice.update({
    where: { id },
    data: { pairingCodeHash: hash, pairingExpiresAt, refreshTokenHash: null }
  });
  return { pairingCode: code, pairingExpiresAt };
}

function serializeDevice(row: {
  id: string;
  name: string;
  boardMode: DisplayBoardMode;
  isActive: boolean;
  lastSeenAt: Date | null;
  pairingExpiresAt: Date | null;
  office: { id: string; name: string; timezone: string };
}) {
  const pairingPending = !!row.pairingExpiresAt && row.pairingExpiresAt > new Date();
  return {
    id: row.id,
    name: row.name,
    boardMode: row.boardMode,
    isActive: row.isActive,
    lastSeenAt: row.lastSeenAt,
    pairingPending,
    office: row.office
  };
}

export const displayService = {
  async list(organizationId: string) {
    const items = await prisma.displayDevice.findMany({
      where: { organizationId },
      include: { office: { select: { id: true, name: true, timezone: true } } },
      orderBy: [{ office: { name: "asc" } }, { name: "asc" }]
    });
    return { items: items.map(serializeDevice) };
  },

  async create(
    organizationId: string,
    input: { officeId: string; name: string; boardMode: DisplayBoardMode },
    audit: AuditContext
  ) {
    const office = await prisma.office.findFirst({ where: { id: input.officeId, organizationId, isActive: true } });
    if (!office) throw new AppError(400, "INVALID_OFFICE", "Office does not exist in this company");
    const device = await prisma.displayDevice.create({
      data: {
        organizationId,
        officeId: input.officeId,
        name: input.name,
        boardMode: input.boardMode,
        createdByUserId: audit.actorUserId
      },
      include: deviceInclude
    });
    const pairing = await setPairingCode(device.id);
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "DISPLAY_CREATED",
        entityType: "DisplayDevice",
        entityId: device.id,
        newValues: auditJson({ name: device.name, officeId: device.officeId, boardMode: device.boardMode }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return { ...serializeDevice({ ...device, pairingExpiresAt: pairing.pairingExpiresAt }), pairingCode: pairing.pairingCode, pairingExpiresAt: pairing.pairingExpiresAt };
  },

  async rePair(organizationId: string, id: string, audit: AuditContext) {
    const device = await prisma.displayDevice.findFirst({ where: { id, organizationId } });
    if (!device) throw new AppError(404, "DISPLAY_NOT_FOUND", "Display not found");
    if (!device.isActive) throw new AppError(409, "DISPLAY_REVOKED", "Reactivate is not supported; create a new display");
    const pairing = await setPairingCode(id);
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "DISPLAY_REPAIRED",
        entityType: "DisplayDevice",
        entityId: id,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return { id, pairingCode: pairing.pairingCode, pairingExpiresAt: pairing.pairingExpiresAt };
  },

  async revoke(organizationId: string, id: string, audit: AuditContext) {
    const device = await prisma.displayDevice.findFirst({ where: { id, organizationId } });
    if (!device) throw new AppError(404, "DISPLAY_NOT_FOUND", "Display not found");
    const updated = await prisma.displayDevice.update({
      where: { id },
      data: { isActive: false, refreshTokenHash: null, pairingCodeHash: null, pairingExpiresAt: null },
      include: { office: { select: { id: true, name: true, timezone: true } } }
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "DISPLAY_REVOKED",
        entityType: "DisplayDevice",
        entityId: id,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return serializeDevice(updated);
  },

  async pair(code: string) {
    const hash = hashToken(code);
    const device = await prisma.displayDevice.findFirst({
      where: { pairingCodeHash: hash, isActive: true },
      include: deviceInclude
    });
    if (!device || !device.pairingExpiresAt || device.pairingExpiresAt <= new Date()) {
      throw new AppError(401, "INVALID_PAIRING_CODE", "That pairing code is invalid or expired");
    }
    const session = await issueSession(device);
    await prisma.auditLog.create({
      data: {
        actorUserId: device.createdByUserId,
        action: "DISPLAY_PAIRED",
        entityType: "DisplayDevice",
        entityId: device.id
      }
    });
    return session;
  },

  async refresh(refreshToken: string) {
    const { displayId } = await verifyDisplayRefreshToken(refreshToken).catch(() => {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid display refresh token");
    });
    const device = await prisma.displayDevice.findFirst({
      where: { id: displayId, isActive: true, refreshTokenHash: hashToken(refreshToken) },
      include: deviceInclude
    });
    if (!device) throw new AppError(401, "DISPLAY_REVOKED", "This display is unpaired");
    return issueSession(device);
  },

  async roomsBoard(organizationId: string, officeId: string, date?: string) {
    const office = await prisma.office.findFirst({
      where: { id: officeId, organizationId, isActive: true },
      select: { id: true, name: true, timezone: true }
    });
    if (!office) throw new AppError(404, "OFFICE_NOT_FOUND", "Office not found");
    const zone = office.timezone || "Africa/Addis_Ababa";
    const now = DateTime.now().setZone(zone);
    const requested = date ? DateTime.fromISO(date, { zone }).startOf("day") : now.startOf("day");
    if (!requested.isValid) throw new AppError(400, "INVALID_DATE", "Date must be YYYY-MM-DD");
    const rangeStart = now.startOf("month");
    const rangeEnd = now.startOf("month").plus({ months: 2 });
    if (requested < rangeStart || requested >= rangeEnd) {
      throw new AppError(422, "DATE_OUT_OF_RANGE", "Displays can only show this month and next month");
    }
    const dayStart = requested;
    const dayEnd = dayStart.plus({ days: 1 });
    const timelineStart = dayStart.set({ hour: DAY_START_HOUR, minute: 0, second: 0, millisecond: 0 });
    const timelineEnd = dayStart.set({ hour: DAY_END_HOUR, minute: 0, second: 0, millisecond: 0 });

    const rooms = await prisma.meetingRoom.findMany({
      where: { organizationId, officeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, location: true, capacity: true }
    });
    const [dayBookings, weekBookings] = await Promise.all([
      prisma.meetingBooking.findMany({
        where: {
          organizationId,
          officeId,
          status: "BOOKED",
          startsAt: { lt: dayEnd.toUTC().toJSDate() },
          endsAt: { gt: dayStart.toUTC().toJSDate() }
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          roomId: true,
          title: true,
          startsAt: true,
          endsAt: true,
          organizer: { select: { firstName: true, lastName: true } }
        }
      }),
      prisma.meetingBooking.findMany({
        where: {
          organizationId,
          officeId,
          status: "BOOKED",
          startsAt: { lt: rangeEnd.toUTC().toJSDate() },
          endsAt: { gt: rangeStart.toUTC().toJSDate() }
        },
        select: { startsAt: true }
      })
    ]);

    const nowJs = now.toJSDate();
    const soonUntil = now.plus({ minutes: SOON_MINUTES }).toJSDate();
    const counts = new Map<string, number>();
    for (const booking of weekBookings) {
      const key = DateTime.fromJSDate(booking.startsAt, { zone: "utc" }).setZone(zone).toFormat("yyyy-MM-dd");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const todayKey = now.toFormat("yyyy-MM-dd");
    const week: { date: string; weekday: number; isToday: boolean; bookingCount: number }[] = [];
    for (let day = rangeStart; day < rangeEnd; day = day.plus({ days: 1 })) {
      const key = day.toFormat("yyyy-MM-dd");
      week.push({
        date: key,
        weekday: day.weekday,
        isToday: key === todayKey,
        bookingCount: counts.get(key) ?? 0
      });
    }

    return {
      office: { id: office.id, name: office.name, timezone: zone },
      now: now.toISO(),
      date: dayStart.toFormat("yyyy-MM-dd"),
      dayStart: `${String(DAY_START_HOUR).padStart(2, "0")}:00`,
      dayEnd: `${String(DAY_END_HOUR).padStart(2, "0")}:00`,
      timelineStart: timelineStart.toISO(),
      timelineEnd: timelineEnd.toISO(),
      week,
      days: week,
      rooms: rooms.map((room) => {
        const slots = dayBookings
          .filter((b) => b.roomId === room.id)
          .map((b) => ({
            id: b.id,
            title: b.title,
            organizerName: wallName(b.organizer?.firstName, b.organizer?.lastName),
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString()
          }));
        const current = slots.find((s) => new Date(s.startsAt) <= nowJs && new Date(s.endsAt) > nowJs) ?? null;
        const next = slots.find((s) => new Date(s.startsAt) > nowJs) ?? null;
        let status: "FREE" | "BUSY" | "SOON" = "FREE";
        if (dayStart.hasSame(now, "day")) {
          if (current) status = "BUSY";
          else if (next && new Date(next.startsAt) <= soonUntil) status = "SOON";
        } else if (slots.length) {
          status = "BUSY";
        }
        return {
          id: room.id,
          name: room.name,
          location: room.location,
          capacity: room.capacity,
          status,
          current,
          next,
          bookings: slots
        };
      })
    };
  },

  async peopleBoard(organizationId: string, officeId: string) {
    const office = await prisma.office.findFirst({
      where: { id: officeId, organizationId, isActive: true },
      select: { id: true, name: true, timezone: true }
    });
    if (!office) throw new AppError(404, "OFFICE_NOT_FOUND", "Office not found");
    const zone = office.timezone || "Africa/Addis_Ababa";
    const now = DateTime.now().setZone(zone);
    const date = now.toFormat("yyyy-MM-dd");
    const roster = await rosterService.attendanceDayRoster(organizationId, { date, officeId }, { allOffices: true, officeIds: [] });

    const inStates = new Set([
      "OPEN",
      "PRESENT_ON_TIME",
      "PRESENT_LATE",
      "COMPLETED_ON_TIME",
      "COMPLETED_LATE",
      "MISSING_CHECKOUT"
    ]);

    const inOffice: { name: string; department: string | null; late: boolean; stillOpen: boolean }[] = [];
    const away: { name: string; department: string | null; reason: string }[] = [];
    const notIn: { name: string; department: string | null }[] = [];

    for (const row of roster.items) {
      if (row.attendanceState === "NON_WORKING_DAY") continue;
      const person = publicPerson(row.employee.firstName, row.employee.lastName, row.employee.department);
      if (row.attendanceState === "ON_LEAVE") {
        away.push({ ...person, reason: "ON_LEAVE" });
        continue;
      }
      if (inStates.has(row.attendanceState)) {
        inOffice.push({
          ...person,
          late: !!row.timesheet?.isLate,
          stillOpen: row.attendanceState === "MISSING_CHECKOUT" || !!row.timesheet?.isOpen
        });
        continue;
      }
      notIn.push(person);
    }

    return {
      office: { id: office.id, name: office.name, timezone: zone },
      now: now.toISO(),
      date,
      weekday: now.weekday,
      weekStart: now.startOf("week").toFormat("yyyy-MM-dd"),
      counts: {
        inOffice: inOffice.length,
        away: away.length,
        notIn: notIn.length,
        late: inOffice.filter((p) => p.late).length
      },
      inOffice,
      away,
      notIn
    };
  }
};
