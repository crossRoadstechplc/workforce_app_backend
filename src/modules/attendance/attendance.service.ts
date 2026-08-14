import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { attendancePhotoService } from "./attendance-photo.service.js";
import { AppError } from "../../shared/errors/app-error.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgRole, emitToUser } from "../../realtime/socket.server.js";
import { ROLE } from "../../shared/tenancy.js";

type LocationInput = { latitude: number; longitude: number; accuracyMeters: number; capturedAt: Date };
type CheckInInput = LocationInput & { idempotencyKey: string; photoUrl?: string; lateReasonType?: string; lateReasonDescription?: string };
type CheckOutInput = LocationInput & { idempotencyKey: string; workDescription: string; photoUrl?: string };

type GeoResult = { distance_meters: number; inside_radius: boolean };

function scheduledInstant(workDate: string, hhmm: string, timezone: string) {
  const dt = DateTime.fromISO(`${workDate}T${hhmm}:00`, { zone: timezone });
  if (!dt.isValid) throw new AppError(500, "INVALID_SCHEDULE_TIME", "Configured schedule time or timezone is invalid");
  return dt;
}

async function employeeContext(userId: string) {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    include: { user: true, office: true, schedule: { include: { days: true } } }
  });
  if (!employee || employee.status !== "ACTIVE" || employee.user.status !== "ACTIVE") throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
  if (!employee.office || !employee.office.isActive) throw new AppError(400, "OFFICE_NOT_ASSIGNED", "An active office assignment is required");
  if (!employee.schedule || !employee.schedule.isActive) throw new AppError(400, "SCHEDULE_NOT_ASSIGNED", "An active work schedule is required");
  return employee;
}

function dayRuleForWeekday(schedule: NonNullable<Awaited<ReturnType<typeof employeeContext>>["schedule"]>, weekday: number) {
  const day = schedule.days.find((d) => d.weekday === weekday);
  if (day) return { checkInTime: day.checkInTime, checkOutTime: day.checkOutTime };
  // Legacy fallback if days were not backfilled yet
  if (schedule.workingDays.includes(weekday)) {
    return { checkInTime: schedule.checkInTime, checkOutTime: schedule.checkOutTime };
  }
  return null;
}

function validateCapturedAt(capturedAt: Date, serverTime: Date) {
  const ageMs = serverTime.getTime() - capturedAt.getTime();
  if (ageMs > 5 * 60_000 || ageMs < -2 * 60_000) throw new AppError(422, "STALE_LOCATION", "Location must be captured near the time of the attendance request");
}

async function geofence(input: LocationInput, office: { latitude: unknown; longitude: unknown; allowedRadiusMeters: number; maximumAccuracyMeters: number }) {
  // Local/dev demos (Chrome, emulators) are rarely at the seeded office coords.
  // Keep real geofencing in production; set ATTENDANCE_DEV_BYPASS_GEOFENCE=false to test it locally.
  const bypass =
    process.env.NODE_ENV !== "production" &&
    process.env.ATTENDANCE_DEV_BYPASS_GEOFENCE !== "false";
  if (bypass) {
    return { distanceMeters: 0, insideRadius: true };
  }

  if (input.accuracyMeters > office.maximumAccuracyMeters) throw new AppError(422, "LOCATION_ACCURACY_TOO_LOW", `Location accuracy must be within ${office.maximumAccuracyMeters} meters`);
  const rows = await prisma.$queryRaw<GeoResult[]>`
    SELECT
      ST_DistanceSphere(
        ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326),
        ST_SetSRID(ST_MakePoint(${Number(office.longitude)}, ${Number(office.latitude)}), 4326)
      ) AS distance_meters,
      ST_DWithin(
        ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${Number(office.longitude)}, ${Number(office.latitude)}), 4326)::geography,
        ${office.allowedRadiusMeters}
      ) AS inside_radius
  `;
  const result = rows[0];
  if (!result) throw new AppError(500, "GEOFENCE_FAILED", "Unable to validate office location");
  return { distanceMeters: Number(result.distance_meters), insideRadius: result.inside_radius };
}

function attendanceClock(employee: Awaited<ReturnType<typeof employeeContext>>, now: Date) {
  const zone = employee.office!.timezone || employee.schedule!.timezone;
  const localNow = DateTime.fromJSDate(now, { zone });
  const workDate = localNow.toISODate()!;
  const weekday = localNow.weekday;
  const dayRule = dayRuleForWeekday(employee.schedule!, weekday);
  if (!dayRule) throw new AppError(409, "NOT_A_WORKING_DAY", "Today is not configured as a working day");
  let scheduledIn = scheduledInstant(workDate, dayRule.checkInTime, zone);
  let scheduledOut = scheduledInstant(workDate, dayRule.checkOutTime, zone);
  if (scheduledOut <= scheduledIn) scheduledOut = scheduledOut.plus({ days: 1 });
  const lateThreshold = scheduledIn.plus({ minutes: employee.schedule!.lateGraceMinutes });
  const lateMinutes = Math.max(0, Math.floor(localNow.diff(lateThreshold, "minutes").minutes));
  return {
    zone,
    workDate,
    scheduledIn,
    scheduledOut,
    lateMinutes,
    isLate: lateMinutes > 0,
    checkInTime: dayRule.checkInTime,
    checkOutTime: dayRule.checkOutTime
  };
}

function toWorkDateKey(workDate: Date) {
  return workDate.toISOString().slice(0, 10);
}

function todayKey(timezone: string) {
  return DateTime.now().setZone(timezone).toISODate()!;
}

function formatTimesheetResponse<T extends { workDate: Date; isOpen: boolean; timezone: string }>(timesheet: T | null) {
  if (!timesheet) return null;
  const workDate = toWorkDateKey(timesheet.workDate);
  const today = todayKey(timesheet.timezone);
  return {
    ...timesheet,
    workDate,
    isCarriedOverOpenShift: timesheet.isOpen && workDate < today
  };
}

function computeCheckoutMetrics(
  open: {
    actualCheckIn: Date;
    scheduledCheckOut: Date;
    workDate: Date;
    timezone: string;
  },
  now: Date
) {
  const rawWorkedMinutes = Math.max(0, Math.floor((now.getTime() - open.actualCheckIn.getTime()) / 60000));
  const scheduledWorkedMinutes = Math.max(
    0,
    Math.floor((open.scheduledCheckOut.getTime() - open.actualCheckIn.getTime()) / 60000)
  );
  const workDateKey = toWorkDateKey(open.workDate);
  const checkoutDateKey = DateTime.fromJSDate(now, { zone: open.timezone }).toISODate()!;
  const isCrossDayCheckout = checkoutDateKey > workDateKey;
  const checkoutAfterScheduled = now.getTime() > open.scheduledCheckOut.getTime();

  if (isCrossDayCheckout) {
    return {
      workedMinutes: scheduledWorkedMinutes,
      earlyCheckoutMinutes: 0,
      overtimeMinutes: 0,
      isEarlyCheckout: false,
      isMissingCheckout: true
    };
  }

  if (checkoutAfterScheduled) {
    return {
      workedMinutes: rawWorkedMinutes,
      earlyCheckoutMinutes: 0,
      overtimeMinutes: Math.max(0, Math.floor((now.getTime() - open.scheduledCheckOut.getTime()) / 60000)),
      isEarlyCheckout: false,
      isMissingCheckout: false
    };
  }

  const earlyCheckoutMinutes = Math.max(0, Math.floor((open.scheduledCheckOut.getTime() - now.getTime()) / 60000));
  return {
    workedMinutes: rawWorkedMinutes,
    earlyCheckoutMinutes,
    overtimeMinutes: 0,
    isEarlyCheckout: earlyCheckoutMinutes > 0,
    isMissingCheckout: false
  };
}

export const attendanceService = {
  formatTimesheetResponse,
  async current(userId: string) {
    const employee = await employeeContext(userId);
    const open = await prisma.timesheet.findFirst({
      where: { employeeId: employee.id, isOpen: true },
      include: { lateReason: true, locations: true }
    });
    if (open) return formatTimesheetResponse(open);

    // After checkout, still return today's timesheet so the app shows
    // "completed" instead of offering another check-in.
    const zone = employee.office!.timezone || employee.schedule!.timezone;
    const workDate = DateTime.now().setZone(zone).startOf("day").toJSDate();
    const todayTimesheet = await prisma.timesheet.findFirst({
      where: { employeeId: employee.id, workDate },
      include: { lateReason: true, locations: true },
      orderBy: { actualCheckIn: "desc" }
    });
    return formatTimesheetResponse(todayTimesheet);
  },

  async officeContext(userId: string) {
    const employee = await employeeContext(userId);
    const office = employee.office!;
    return {
      id: office.id,
      name: office.name,
      address: office.address,
      latitude: Number(office.latitude),
      longitude: Number(office.longitude),
      allowedRadiusMeters: office.allowedRadiusMeters,
      maximumAccuracyMeters: office.maximumAccuracyMeters,
      timezone: office.timezone || employee.schedule!.timezone,
      photoRequired: attendancePhotoService.isRequired()
    };
  },

  async preview(userId: string, input: LocationInput) {
    const employee = await employeeContext(userId);
    const open = await prisma.timesheet.findFirst({ where: { employeeId: employee.id, isOpen: true }, select: { id: true } });
    if (open) throw new AppError(409, "ALREADY_CHECKED_IN", "Close your open shift with checkout before checking in again");
    const now = new Date();
    validateCapturedAt(input.capturedAt, now);
    const clock = attendanceClock(employee, now);
    const geo = await geofence(input, employee.office!);
    return { ...geo, isLate: clock.isLate, lateMinutes: clock.lateMinutes, requiresLateReason: clock.isLate, workDate: clock.workDate, serverTime: now };
  },

  async checkIn(userId: string, input: CheckInInput) {
    const employee = await employeeContext(userId);
    const existing = await prisma.timesheet.findUnique({ where: { checkInIdempotencyKey: input.idempotencyKey }, include: { lateReason: true, locations: true } });
    if (existing) {
      if (existing.employeeId !== employee.id) throw new AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key is already in use");
      return formatTimesheetResponse(existing)!;
    }
    const now = new Date();
    validateCapturedAt(input.capturedAt, now);
    const clock = attendanceClock(employee, now);
    const geo = await geofence(input, employee.office!);
    if (!geo.insideRadius) throw new AppError(422, "OUTSIDE_OFFICE_RADIUS", "Check-in is outside the allowed office radius");
    if (clock.isLate && !input.lateReasonType) throw new AppError(422, "LATE_REASON_REQUIRED", "A late reason is required");
    if (!clock.isLate && (input.lateReasonType || input.lateReasonDescription)) throw new AppError(422, "LATE_REASON_NOT_ALLOWED", "A late reason is only accepted for late check-in");
    attendancePhotoService.validatePhotoUrl(input.photoUrl);

    const result = await prisma.$transaction(async (tx) => {
      const open = await tx.timesheet.findFirst({ where: { employeeId: employee.id, isOpen: true }, select: { id: true } });
      if (open) throw new AppError(409, "ALREADY_CHECKED_IN", "Close your open shift with checkout before checking in again");
      const timesheet = await tx.timesheet.create({
        data: {
          employeeId: employee.id, officeId: employee.office!.id, scheduleId: employee.schedule!.id,
          workDate: DateTime.fromISO(clock.workDate, { zone: clock.zone }).startOf("day").toJSDate(),
          scheduledCheckIn: clock.scheduledIn.toUTC().toJSDate(), scheduledCheckOut: clock.scheduledOut.toUTC().toJSDate(), actualCheckIn: now,
          lateMinutes: clock.lateMinutes, isLate: clock.isLate, status: clock.isLate ? "PRESENT_LATE" : "PRESENT_ON_TIME",
          checkInIdempotencyKey: input.idempotencyKey,
          scheduleCheckInTime: clock.checkInTime, scheduleCheckOutTime: clock.checkOutTime,
          scheduleLateGraceMinutes: employee.schedule!.lateGraceMinutes,
          officeLatitude: employee.office!.latitude, officeLongitude: employee.office!.longitude,
          officeAllowedRadiusMeters: employee.office!.allowedRadiusMeters, officeMaximumAccuracyMeters: employee.office!.maximumAccuracyMeters,
          timezone: clock.zone,
          locations: { create: { type: "CHECK_IN", latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters, distanceFromOfficeMeters: geo.distanceMeters, allowedRadiusMeters: employee.office!.allowedRadiusMeters, isInsideRadius: true, capturedAt: input.capturedAt, serverReceivedAt: now, photoUrl: input.photoUrl ?? null } },
          ...(clock.isLate ? { lateReason: { create: { employeeId: employee.id, reasonType: input.lateReasonType!, reasonDescription: input.lateReasonDescription, submittedAt: now } } } : {})
        }, include: { lateReason: true, locations: true }
      });
      const notification = await tx.notification.create({ data: { userId, type: clock.isLate ? "CHECK_IN_LATE" : "CHECK_IN_SUCCESS", title: clock.isLate ? "Late check-in recorded" : "Check-in successful", message: clock.isLate ? `You checked in ${clock.lateMinutes} minute(s) late.` : "Your check-in was recorded successfully.", relatedEntityType: "Timesheet", relatedEntityId: timesheet.id } });
      return { timesheet, notification };
    });
    await deliverNotification(result.notification);
    emitToUser(userId, "attendance.checked_in", { timesheetId: result.timesheet.id, status: result.timesheet.status });
    emitToOrgRole(employee.organizationId, ROLE.ORG_ADMIN, clock.isLate ? "employee.checked_in_late" : "employee.checked_in", { employeeId: employee.id, timesheetId: result.timesheet.id, lateMinutes: clock.lateMinutes });
    return formatTimesheetResponse(result.timesheet)!;
  },

  async checkOut(userId: string, input: CheckOutInput) {
    const employee = await employeeContext(userId);
    const existing = await prisma.timesheet.findUnique({ where: { checkOutIdempotencyKey: input.idempotencyKey }, include: { worksheet: true, locations: true } });
    if (existing) {
      if (existing.employeeId !== employee.id) throw new AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key is already in use");
      return formatTimesheetResponse(existing)!;
    }
    const open = await prisma.timesheet.findFirst({ where: { employeeId: employee.id, isOpen: true } });
    if (!open) throw new AppError(409, "NO_OPEN_TIMESHEET", "No open timesheet exists");
    const now = new Date();
    validateCapturedAt(input.capturedAt, now);
    const geo = await geofence(input, { latitude: open.officeLatitude, longitude: open.officeLongitude, allowedRadiusMeters: open.officeAllowedRadiusMeters, maximumAccuracyMeters: open.officeMaximumAccuracyMeters });
    if (!geo.insideRadius) throw new AppError(422, "OUTSIDE_OFFICE_RADIUS", "Checkout is outside the allowed office radius");
    attendancePhotoService.validatePhotoUrl(input.photoUrl);
    const metrics = computeCheckoutMetrics(open, now);
    const completedStatus = open.isLate ? "COMPLETED_LATE" : "COMPLETED_ON_TIME";
    const closedCarriedOverShift = toWorkDateKey(open.workDate) < todayKey(open.timezone);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.timesheet.findUnique({ where: { id: open.id } });
      if (!current?.isOpen) throw new AppError(409, "TIMESHEET_ALREADY_CLOSED", "Timesheet is already closed");
      const timesheet = await tx.timesheet.update({
        where: { id: open.id }, data: {
          actualCheckOut: now,
          workedMinutes: metrics.workedMinutes,
          earlyCheckoutMinutes: metrics.earlyCheckoutMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          isEarlyCheckout: metrics.isEarlyCheckout,
          isMissingCheckout: open.isMissingCheckout || metrics.isMissingCheckout,
          isOpen: false,
          status: metrics.isMissingCheckout || open.isMissingCheckout ? "MISSING_CHECKOUT" : completedStatus,
          checkOutIdempotencyKey: input.idempotencyKey,
          locations: { create: { type: "CHECK_OUT", latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters, distanceFromOfficeMeters: geo.distanceMeters, allowedRadiusMeters: open.officeAllowedRadiusMeters, isInsideRadius: true, capturedAt: input.capturedAt, serverReceivedAt: now, photoUrl: input.photoUrl ?? null } },
          worksheet: { create: { employeeId: employee.id, workDate: open.workDate, workDescription: input.workDescription, submittedAt: now } }
        }, include: { worksheet: true, lateReason: true, locations: true }
      });
      const notification = await tx.notification.create({
        data: {
          userId,
          type: "CHECK_OUT_SUCCESS",
          title: closedCarriedOverShift ? "Previous shift closed" : "Checkout successful",
          message: closedCarriedOverShift
            ? `Your open shift from ${toWorkDateKey(open.workDate)} is closed. Worked time: ${metrics.workedMinutes} minutes. You can check in for today.`
            : `You checked out successfully. Worked time: ${metrics.workedMinutes} minutes.`,
          relatedEntityType: "Timesheet",
          relatedEntityId: timesheet.id
        }
      });
      return { timesheet, notification };
    });
    await deliverNotification(result.notification);
    emitToUser(userId, "attendance.checked_out", { timesheetId: result.timesheet.id, workedMinutes: metrics.workedMinutes, closedCarriedOverShift });
    emitToOrgRole(employee.organizationId, ROLE.ORG_ADMIN, "employee.checked_out", { employeeId: employee.id, timesheetId: result.timesheet.id, workedMinutes: metrics.workedMinutes });
    return formatTimesheetResponse(result.timesheet)!;
  }
};
