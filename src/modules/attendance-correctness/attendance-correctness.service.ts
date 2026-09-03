import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgAdmins, emitToUser } from "../../realtime/socket.server.js";
import { ROLE } from "../../shared/tenancy.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";
import { formatWorkDateKey, workDateFromKey } from "../../shared/work-date.js";

type ScheduleInfo = {
  id: string;
  timezone: string;
  lateGraceMinutes: number;
  checkInTime: string;
  checkOutTime: string;
  workingDays: number[];
  days: { weekday: number; checkInTime: string; checkOutTime: string }[];
};

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

async function orgAdminUserIds(organizationId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      memberships: { some: { organizationId } },
      userRoles: { some: { role: { name: { in: [ROLE.ORG_ADMIN, ROLE.OFFICE_ADMIN, "ADMIN"] } } } }
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

function serializeRequest(row: {
  id: string;
  workDate: Date;
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

async function applyScheduledCorrectness(timesheetId: string, audit: AuditContext) {
  const current = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: { employee: { select: { userId: true } } }
  });
  if (!current) throw new AppError(404, "TIMESHEET_NOT_FOUND", "Timesheet not found");

  const checkIn = current.scheduledCheckIn;
  const checkOut = current.scheduledCheckOut;
  const workedMinutes = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000));

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      actualCheckIn: checkIn,
      actualCheckOut: checkOut,
      lateMinutes: 0,
      workedMinutes,
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
      reason: "Attendance correctness approved",
      previousValues: auditJson(current)!,
      correctedValues: auditJson(updated)!
    }
  });

  return { updated, userId: current.employee.userId, workDate: current.workDate };
}

async function createScheduledTimesheet(
  employee: Awaited<ReturnType<typeof employeeContext>>,
  workDateKey: string,
  audit: AuditContext
) {
  const bounds = scheduleBounds(workDateKey, employee.schedule!, employee.office!.timezone || employee.schedule!.timezone);
  if (!bounds) throw new AppError(422, "NOT_A_WORKING_DAY", "Selected date is not a working day");

  const workDate = workDateFromKey(workDateKey);
  const existing = await prisma.timesheet.findUnique({
    where: { employeeId_workDate: { employeeId: employee.id, workDate } }
  });
  if (existing) return applyScheduledCorrectness(existing.id, audit);

  const office = employee.office!;
  const created = await prisma.timesheet.create({
    data: {
      employeeId: employee.id,
      officeId: office.id,
      scheduleId: employee.schedule!.id,
      workDate,
      scheduledCheckIn: bounds.scheduledIn,
      scheduledCheckOut: bounds.scheduledOut,
      actualCheckIn: bounds.scheduledIn,
      actualCheckOut: bounds.scheduledOut,
      lateMinutes: 0,
      workedMinutes: bounds.workedMinutes,
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
      reason: "Attendance correctness approved (created from schedule)",
      previousValues: {},
      correctedValues: auditJson(created)!
    }
  });

  return { updated: created, userId: employee.userId, workDate };
}

export const attendanceCorrectnessService = {
  async createRequests(userId: string, input: { dates: string[]; note?: string }) {
    const employee = await employeeContext(userId);
    const uniqueDates = [...new Set(input.dates)].sort();
    if (!uniqueDates.length) throw new AppError(422, "DATES_REQUIRED", "Select at least one date");

    const zone = employee.office!.timezone || employee.schedule!.timezone;
    const todayKey = DateTime.now().setZone(zone).toISODate()!;

    const created = [];
    for (const workDateKey of uniqueDates) {
      if (workDateKey >= todayKey) throw new AppError(422, "FUTURE_DATE_NOT_ALLOWED", "Correctness can only be requested for past dates");
      const bounds = scheduleBounds(workDateKey, employee.schedule!, zone);
      if (!bounds) throw new AppError(422, "NOT_A_WORKING_DAY", `${workDateKey} is not a working day`);

      const workDate = workDateFromKey(workDateKey);
      const onLeave = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: "APPROVED",
          startDate: { lte: workDate },
          endDate: { gte: workDate }
        },
        select: { id: true }
      });
      if (onLeave) throw new AppError(409, "ON_LEAVE", `You were on leave on ${workDateKey}`);

      const pending = await prisma.attendanceCorrectnessRequest.findFirst({
        where: { employeeId: employee.id, workDate, status: "PENDING" }
      });
      if (pending) throw new AppError(409, "REQUEST_ALREADY_PENDING", `A pending request already exists for ${workDateKey}`);

      const approved = await prisma.attendanceCorrectnessRequest.findFirst({
        where: { employeeId: employee.id, workDate, status: "APPROVED" }
      });
      if (approved) throw new AppError(409, "ALREADY_APPROVED", `Correctness was already approved for ${workDateKey}`);

      const timesheet = await prisma.timesheet.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate } }
      });

      const row = await prisma.attendanceCorrectnessRequest.create({
        data: {
          organizationId: employee.organizationId,
          employeeId: employee.id,
          workDate,
          timesheetId: timesheet?.id ?? null,
          employeeNote: input.note?.trim() || null
        },
        include: { employee: { include: { office: { select: { id: true, name: true } } } } }
      });
      created.push(row);
    }

    const admins = await orgAdminUserIds(employee.organizationId);
    for (const row of created) {
      for (const adminId of admins) {
        const n = await prisma.notification.create({
          data: {
            userId: adminId,
            type: "ATTENDANCE_CORRECTNESS_SUBMITTED",
            title: "Attendance correctness request",
            message: `${employee.firstName} ${employee.lastName} requested attendance correction for ${formatWorkDateKey(row.workDate)}.`,
            relatedEntityType: "AttendanceCorrectnessRequest",
            relatedEntityId: row.id
          }
        });
        await deliverNotification(n);
      }
      emitToOrgAdmins(employee.organizationId, "attendance.correctness_requested", {
        requestId: row.id,
        employeeId: employee.id,
        workDate: formatWorkDateKey(row.workDate)
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

    let timesheetResult;
    if (request.timesheetId) {
      timesheetResult = await applyScheduledCorrectness(request.timesheetId, audit);
    } else {
      timesheetResult = await createScheduledTimesheet(request.employee as Awaited<ReturnType<typeof employeeContext>>, formatWorkDateKey(request.workDate), audit);
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

    const n = await prisma.notification.create({
      data: {
        userId: request.employee.userId,
        type: "ATTENDANCE_CORRECTNESS_APPROVED",
        title: "Attendance corrected",
        message: `Your attendance for ${formatWorkDateKey(request.workDate)} was approved.`,
        relatedEntityType: "AttendanceCorrectnessRequest",
        relatedEntityId: id
      }
    });
    await deliverNotification(n);
    emitToUser(request.employee.userId, "attendance.correctness_decided", { requestId: id, status: "APPROVED" });
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
