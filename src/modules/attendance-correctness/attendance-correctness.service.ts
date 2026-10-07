import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgAdmins, emitToUser } from "../../realtime/socket.server.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";
import { formatWorkDateKey, workDateFromKey } from "../../shared/work-date.js";
import { leaveSessionsConflict, type LeaveDaySession } from "../../shared/schedule-day-fraction.js";
import { holidayLookup } from "../holidays/holiday.service.js";

type ScheduleInfo = {
  id: string;
  timezone: string;
  lateGraceMinutes: number;
  checkInTime: string;
  checkOutTime: string;
  workingDays: number[];
  days: { weekday: number; checkInTime: string; checkOutTime: string }[];
};

type DayInput = { date: string; session: LeaveDaySession };

async function employeeContext(userId: string) {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    include: { user: true, office: true, schedule: { include: { days: true } } }
  });
  if (!employee || employee.status !== "ACTIVE" || employee.user.status !== "ACTIVE") {
    throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
  }
  if (!employee.office || !employee.office.isActive) throw new AppError(400, "OFFICE_NOT_ASSIGNED", "An active office assignment is required");
  if (!employee.schedule || !employee.schedule.isActive) throw new AppError(400, "SCHEDULE_NOT_ASSIGNED", "An active work schedule is required");
  return employee;
}

function dayRuleForWeekday(schedule: ScheduleInfo, weekday: number) {
  const day = schedule.days.find((d) => d.weekday === weekday);
  if (day) return { checkInTime: day.checkInTime, checkOutTime: day.checkOutTime };
  if (schedule.workingDays.includes(weekday)) {
    return { checkInTime: schedule.checkInTime, checkOutTime: schedule.checkOutTime };
  }
  return null;
}

function scheduledInstant(workDate: string, hhmm: string, timezone: string) {
  const dt = DateTime.fromISO(`${workDate}T${hhmm}:00`, { zone: timezone });
  if (!dt.isValid) throw new AppError(500, "INVALID_SCHEDULE_TIME", "Configured schedule time or timezone is invalid");
  return dt;
}

function scheduleBounds(workDateKey: string, schedule: ScheduleInfo, officeTimezone: string) {
  const zone = officeTimezone || schedule.timezone;
  const weekday = DateTime.fromISO(workDateKey, { zone: "utc" }).weekday;
  const dayRule = dayRuleForWeekday(schedule, weekday);
  if (!dayRule) return null;
  let scheduledIn = scheduledInstant(workDateKey, dayRule.checkInTime, zone);
  let scheduledOut = scheduledInstant(workDateKey, dayRule.checkOutTime, zone);
  if (scheduledOut <= scheduledIn) scheduledOut = scheduledOut.plus({ days: 1 });
  return {
    zone,
    scheduledIn: scheduledIn.toUTC().toJSDate(),
    scheduledOut: scheduledOut.toUTC().toJSDate(),
    checkInTime: dayRule.checkInTime,
    checkOutTime: dayRule.checkOutTime,
    workedMinutes: Math.max(0, Math.floor(scheduledOut.diff(scheduledIn, "minutes").minutes))
  };
}

function sessionActuals(scheduledIn: Date, scheduledOut: Date, session: LeaveDaySession) {
  const startMs = scheduledIn.getTime();
  const endMs = scheduledOut.getTime();
  const midMs = startMs + Math.floor((endMs - startMs) / 2);
  const mid = new Date(midMs);
  if (session === "MORNING") {
    return {
      checkIn: scheduledIn,
      checkOut: mid,
      workedMinutes: Math.max(0, Math.floor((midMs - startMs) / 60000))
    };
  }
  if (session === "AFTERNOON") {
    return {
      checkIn: mid,
      checkOut: scheduledOut,
      workedMinutes: Math.max(0, Math.floor((endMs - midMs) / 60000))
    };
  }
  return {
    checkIn: scheduledIn,
    checkOut: scheduledOut,
    workedMinutes: Math.max(0, Math.floor((endMs - startMs) / 60000))
  };
}

function normalizeDayInputs(input: { dates?: string[]; days?: DayInput[] }): DayInput[] {
  if (input.days?.length) {
    const map = new Map<string, LeaveDaySession>();
    for (const day of input.days) {
      map.set(`${day.date}:${day.session}`, day.session);
    }
    return [...map.entries()]
      .map(([key, session]) => ({ date: key.split(":")[0]!, session }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session));
  }
  const dates = [...new Set(input.dates ?? [])].sort();
  return dates.map((date) => ({ date, session: "FULL" as const }));
}

async function orgAdminUserIds(organizationId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { adminOrganizations: { some: { organizationId } } },
        { adminOffices: { some: { office: { organizationId } } } }
      ]
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

function serializeRequest(row: {
  id: string;
  workDate: Date;
  session?: LeaveDaySession | string | null;
  status: string;
  employeeNote: string | null;
  adminNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  timesheetId: string | null;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; officeId: string | null; office?: { id: string; name: string } | null };
}) {
  return {
    id: row.id,
    workDate: formatWorkDateKey(row.workDate),
    session: (row.session as LeaveDaySession) ?? "FULL",
    status: row.status,
    employeeNote: row.employeeNote,
    adminNote: row.adminNote,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    timesheetId: row.timesheetId,
    employee: {
      id: row.employee.id,
      employeeCode: row.employee.employeeCode,
      firstName: row.employee.firstName,
      lastName: row.employee.lastName,
      officeId: row.employee.officeId,
      office: row.employee.office ? { id: row.employee.office.id, name: row.employee.office.name } : null
    }
  };
}

async function leaveSessionsForDate(employeeId: string, workDate: Date): Promise<LeaveDaySession[]> {
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: workDate },
      endDate: { gte: workDate }
    },
    include: { days: { where: { date: workDate }, select: { session: true } } }
  });
  const sessions: LeaveDaySession[] = [];
  for (const leave of leaves) {
    if (leave.days.length) {
      for (const day of leave.days) sessions.push(day.session);
    } else {
      sessions.push("FULL");
    }
  }
  return sessions;
}

async function applyScheduledCorrectness(timesheetId: string, session: LeaveDaySession, audit: AuditContext) {
  const current = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: { employee: { select: { userId: true } } }
  });
  if (!current) throw new AppError(404, "TIMESHEET_NOT_FOUND", "Timesheet not found");

  const actuals = sessionActuals(current.scheduledCheckIn, current.scheduledCheckOut, session);

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      actualCheckIn: actuals.checkIn,
      actualCheckOut: actuals.checkOut,
      lateMinutes: 0,
      workedMinutes: actuals.workedMinutes,
      earlyCheckoutMinutes: 0,
      overtimeMinutes: 0,
      isLate: false,
      isEarlyCheckout: false,
      isMissingCheckout: false,
      isOpen: false,
      status: "COMPLETED_ON_TIME"
    }
  });

  await prisma.attendanceCorrection.create({
    data: {
      timesheetId,
      actorUserId: audit.actorUserId,
      reason: `Attendance correctness approved (${session})`,
      previousValues: auditJson(current)!,
      correctedValues: auditJson(updated)!
    }
  });

  return { updated, userId: current.employee.userId, workDate: current.workDate };
}

async function createScheduledTimesheet(
  employee: Awaited<ReturnType<typeof employeeContext>>,
  workDateKey: string,
  session: LeaveDaySession,
  audit: AuditContext
) {
  const bounds = scheduleBounds(workDateKey, employee.schedule!, employee.office!.timezone || employee.schedule!.timezone);
  if (!bounds) throw new AppError(422, "NOT_A_WORKING_DAY", "Selected date is not a working day");

  const workDate = workDateFromKey(workDateKey);
  const existing = await prisma.timesheet.findUnique({
    where: { employeeId_workDate: { employeeId: employee.id, workDate } }
  });
  if (existing) return applyScheduledCorrectness(existing.id, session, audit);

  const actuals = sessionActuals(bounds.scheduledIn, bounds.scheduledOut, session);
  const office = employee.office!;
  const created = await prisma.timesheet.create({
    data: {
      employeeId: employee.id,
      officeId: office.id,
      scheduleId: employee.schedule!.id,
      workDate,
      scheduledCheckIn: bounds.scheduledIn,
      scheduledCheckOut: bounds.scheduledOut,
      actualCheckIn: actuals.checkIn,
      actualCheckOut: actuals.checkOut,
      lateMinutes: 0,
      workedMinutes: actuals.workedMinutes,
      earlyCheckoutMinutes: 0,
      overtimeMinutes: 0,
      isLate: false,
      isEarlyCheckout: false,
      isMissingCheckout: false,
      isOpen: false,
      status: "COMPLETED_ON_TIME",
      checkInIdempotencyKey: randomUUID(),
      checkOutIdempotencyKey: randomUUID(),
      scheduleCheckInTime: bounds.checkInTime,
      scheduleCheckOutTime: bounds.checkOutTime,
      scheduleLateGraceMinutes: employee.schedule!.lateGraceMinutes,
      officeLatitude: office.latitude,
      officeLongitude: office.longitude,
      officeAllowedRadiusMeters: office.allowedRadiusMeters,
      officeMaximumAccuracyMeters: office.maximumAccuracyMeters,
      timezone: bounds.zone
    }
  });

  await prisma.attendanceCorrection.create({
    data: {
      timesheetId: created.id,
      actorUserId: audit.actorUserId,
      reason: `Attendance correctness approved (created from schedule, ${session})`,
      previousValues: {},
      correctedValues: auditJson(created)!
    }
  });

  return { updated: created, userId: employee.userId, workDate };
}

export const attendanceCorrectnessService = {
  async createRequests(userId: string, input: { dates?: string[]; days?: DayInput[]; note?: string }) {
    const employee = await employeeContext(userId);
    const dayInputs = normalizeDayInputs(input);
    if (!dayInputs.length) throw new AppError(422, "DATES_REQUIRED", "Select at least one date");

    const zone = employee.office!.timezone || employee.schedule!.timezone;
    const todayKey = DateTime.now().setZone(zone).toISODate()!;

    const created = [];
    for (const day of dayInputs) {
      const workDateKey = day.date;
      const session = day.session;
      if (workDateKey >= todayKey) throw new AppError(422, "FUTURE_DATE_NOT_ALLOWED", "Correctness can only be requested for past dates");
      const bounds = scheduleBounds(workDateKey, employee.schedule!, zone);
      if (!bounds) throw new AppError(422, "NOT_A_WORKING_DAY", `${workDateKey} is not a working day`);

      const workDate = workDateFromKey(workDateKey);
      const leaveSessions = await leaveSessionsForDate(employee.id, workDate);
      if (leaveSessions.some((leaveSession) => leaveSessionsConflict(leaveSession, session))) {
        throw new AppError(409, "ON_LEAVE", `You were on leave on ${workDateKey} for this part of the day`);
      }

      const onHoliday = await holidayLookup.forEmployee(employee.id, workDateKey);
      if (onHoliday) {
        throw new AppError(409, "ON_PUBLIC_HOLIDAY", `${workDateKey} was a public holiday (${onHoliday.nameEn})`);
      }

      const existingActive = await prisma.attendanceCorrectnessRequest.findMany({
        where: {
          employeeId: employee.id,
          workDate,
          status: { in: ["PENDING", "APPROVED"] }
        },
        select: { id: true, status: true, session: true }
      });
      for (const row of existingActive) {
        const existingSession = (row.session as LeaveDaySession) ?? "FULL";
        if (!leaveSessionsConflict(existingSession, session)) continue;
        if (row.status === "PENDING") {
          throw new AppError(409, "REQUEST_ALREADY_PENDING", `A pending request already exists for ${workDateKey}`);
        }
        throw new AppError(409, "ALREADY_APPROVED", `Correctness was already approved for ${workDateKey}`);
      }

      const timesheet = await prisma.timesheet.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate } }
      });

      const row = await prisma.attendanceCorrectnessRequest.create({
        data: {
          organizationId: employee.organizationId,
          employeeId: employee.id,
          workDate,
          session,
          timesheetId: timesheet?.id ?? null,
          employeeNote: input.note?.trim() || null
        },
        include: { employee: { include: { office: { select: { id: true, name: true } } } } }
      });
      created.push(row);
    }

    const admins = await orgAdminUserIds(employee.organizationId);
    for (const row of created) {
      const sessionLabel =
        row.session === "MORNING" ? "half day morning" : row.session === "AFTERNOON" ? "half day afternoon" : "full day";
      for (const adminId of admins) {
        const n = await prisma.notification.create({
          data: {
            userId: adminId,
            type: "ATTENDANCE_CORRECTNESS_SUBMITTED",
            title: "Attendance correctness request",
            message: `${employee.firstName} ${employee.lastName} requested attendance correction for ${formatWorkDateKey(row.workDate)} (${sessionLabel}).`,
            relatedEntityType: "AttendanceCorrectnessRequest",
            relatedEntityId: row.id
          }
        });
        await deliverNotification(n);
      }
      emitToOrgAdmins(employee.organizationId, "attendance.correctness_requested", {
        requestId: row.id,
        employeeId: employee.id,
        workDate: formatWorkDateKey(row.workDate),
        session: row.session
      });
    }

    return created.map(serializeRequest);
  },

  async myRequests(userId: string, input: { from?: Date; to?: Date }) {
    const employee = await employeeContext(userId);
    const items = await prisma.attendanceCorrectnessRequest.findMany({
      where: {
        employeeId: employee.id,
        ...(input.from || input.to
          ? {
              workDate: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {})
              }
            }
          : {})
      },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: { employee: { include: { office: { select: { id: true, name: true } } } } }
    });
    return items.map(serializeRequest);
  },

  async adminList(
    organizationId: string,
    input: { date?: string; status?: string; officeId?: string },
    scope: OfficeScope
  ) {
    const where: Record<string, unknown> = {
      organizationId,
      employee: employeeOfficeFilter(scope, input.officeId)
    };
    if (input.date) where.workDate = workDateFromKey(input.date);
    if (input.status) where.status = input.status;

    const items = await prisma.attendanceCorrectnessRequest.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: {
        employee: { include: { office: { select: { id: true, name: true } } } },
        timesheet: {
          select: {
            id: true,
            actualCheckIn: true,
            actualCheckOut: true,
            scheduledCheckIn: true,
            scheduledCheckOut: true,
            lateMinutes: true,
            workedMinutes: true,
            isLate: true,
            isMissingCheckout: true,
            status: true
          }
        }
      }
    });

    return items.map((row) => ({
      ...serializeRequest(row),
      timesheet: row.timesheet
    }));
  },

  async approve(organizationId: string, id: string, audit: AuditContext, scope: OfficeScope, adminNote?: string) {
    const request = await prisma.attendanceCorrectnessRequest.findUnique({
      where: { id },
      include: {
        employee: { include: { office: true, schedule: { include: { days: true } }, user: true } },
        timesheet: true
      }
    });
    if (!request || request.organizationId !== organizationId) {
      throw new AppError(404, "REQUEST_NOT_FOUND", "Correctness request not found");
    }
    assertOfficeInScope(scope, request.employee.officeId, "You do not manage this office");
    if (request.status !== "PENDING") throw new AppError(409, "REQUEST_NOT_PENDING", "Only pending requests can be approved");

    const session = (request.session as LeaveDaySession) ?? "FULL";
    let timesheetResult;
    if (request.timesheetId) {
      timesheetResult = await applyScheduledCorrectness(request.timesheetId, session, audit);
    } else {
      timesheetResult = await createScheduledTimesheet(
        request.employee as Awaited<ReturnType<typeof employeeContext>>,
        formatWorkDateKey(request.workDate),
        session,
        audit
      );
    }

    const updated = await prisma.attendanceCorrectnessRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        adminNote: adminNote?.trim() || null,
        reviewedByUserId: audit.actorUserId,
        reviewedAt: new Date(),
        timesheetId: timesheetResult.updated.id
      },
      include: { employee: { include: { office: { select: { id: true, name: true } } } } }
    });

    const sessionLabel = session === "MORNING" ? " (half day morning)" : session === "AFTERNOON" ? " (half day afternoon)" : "";
    const n = await prisma.notification.create({
      data: {
        userId: request.employee.userId,
        type: "ATTENDANCE_CORRECTNESS_APPROVED",
        title: "Attendance corrected",
        message: `Your attendance for ${formatWorkDateKey(request.workDate)}${sessionLabel} was approved.`,
        relatedEntityType: "AttendanceCorrectnessRequest",
        relatedEntityId: id
      }
    });
    await deliverNotification(n);
    emitToUser(request.employee.userId, "attendance.correctness_decided", { requestId: id, status: "APPROVED", session });
    emitToOrgAdmins(organizationId, "attendance.correctness_decided", { requestId: id, status: "APPROVED", session });
    emitToOrgAdmins(organizationId, "attendance.corrected", { timesheetId: timesheetResult.updated.id, employeeId: request.employeeId });

    return serializeRequest(updated);
  },

  async reject(organizationId: string, id: string, audit: AuditContext, scope: OfficeScope, adminNote?: string) {
    const request = await prisma.attendanceCorrectnessRequest.findUnique({
      where: { id },
      include: { employee: { include: { office: { select: { id: true, name: true } } } } }
    });
    if (!request || request.organizationId !== organizationId) {
      throw new AppError(404, "REQUEST_NOT_FOUND", "Correctness request not found");
    }
    assertOfficeInScope(scope, request.employee.officeId, "You do not manage this office");
    if (request.status !== "PENDING") throw new AppError(409, "REQUEST_NOT_PENDING", "Only pending requests can be rejected");

    const updated = await prisma.attendanceCorrectnessRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote: adminNote?.trim() || null,
        reviewedByUserId: audit.actorUserId,
        reviewedAt: new Date()
      },
      include: { employee: { include: { office: { select: { id: true, name: true } } } } }
    });

    const employee = await prisma.employee.findUnique({ where: { id: request.employeeId }, select: { userId: true } });
    if (employee) {
      const n = await prisma.notification.create({
        data: {
          userId: employee.userId,
          type: "ATTENDANCE_CORRECTNESS_REJECTED",
          title: "Attendance request declined",
          message: `Your attendance request for ${formatWorkDateKey(request.workDate)} was declined.`,
          relatedEntityType: "AttendanceCorrectnessRequest",
          relatedEntityId: id
        }
      });
      await deliverNotification(n);
      emitToUser(employee.userId, "attendance.correctness_decided", { requestId: id, status: "REJECTED" });
      emitToOrgAdmins(request.organizationId, "attendance.correctness_decided", { requestId: id, status: "REJECTED" });
    }

    return serializeRequest(updated);
  },

  async mapForEmployees(employeeIds: string[], workDate: Date) {
    if (!employeeIds.length) return new Map<string, { status: string; id: string }>();
    const rows = await prisma.attendanceCorrectnessRequest.findMany({
      where: { employeeId: { in: employeeIds }, workDate },
      orderBy: { createdAt: "desc" }
    });
    const map = new Map<string, { status: string; id: string }>();
    for (const row of rows) {
      if (!map.has(row.employeeId)) map.set(row.employeeId, { status: row.status, id: row.id });
    }
    return map;
  },

  async mapForEmployeeRange(employeeId: string, from: Date, to: Date) {
    const rows = await prisma.attendanceCorrectnessRequest.findMany({
      where: { employeeId, workDate: { gte: from, lt: to } },
      orderBy: { createdAt: "desc" }
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      const key = formatWorkDateKey(row.workDate);
      if (!map.has(key)) map.set(key, row.status);
    }
    return map;
  }
};
