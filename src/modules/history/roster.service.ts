import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";

type ScheduleInfo = {
  workingDays: number[];
  days: { weekday: number }[];
  timezone: string;
};

function dayBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

function parseIsoDate(value: string) {
  const dt = DateTime.fromISO(value, { zone: "utc" });
  if (!dt.isValid) throw new AppError(422, "INVALID_DATE", "Invalid date");
  return dt.startOf("day").toJSDate();
}

function assertNotFutureDate(date: Date) {
  const today = DateTime.utc().startOf("day");
  const d = DateTime.fromJSDate(date, { zone: "utc" }).startOf("day");
  if (d > today) throw new AppError(422, "FUTURE_DATE_NOT_ALLOWED", "Cannot view future dates");
}

function assertNotFutureMonth(year: number, month: number) {
  const selected = DateTime.utc(year, month, 1).startOf("month");
  const current = DateTime.utc().startOf("month");
  if (selected > current) throw new AppError(422, "FUTURE_DATE_NOT_ALLOWED", "Cannot view future months");
}

function isWorkingDay(schedule: ScheduleInfo | null | undefined, weekday: number) {
  if (!schedule) return false;
  if (schedule.days?.length) return schedule.days.some((d) => d.weekday === weekday);
  return schedule.workingDays.includes(weekday);
}

function employeeWhere(organizationId: string, scope: OfficeScope, officeId?: string) {
  return { status: "ACTIVE" as const, organizationId, ...employeeOfficeFilter(scope, officeId) };
}

function person(e: {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string | null;
  officeId: string | null;
  office?: { id: string; name: string } | null;
}) {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    department: e.department,
    officeId: e.officeId,
    office: e.office ? { id: e.office.id, name: e.office.name } : null
  };
}

function deriveAttendanceState(input: {
  timesheet: {
    status: string;
    isOpen: boolean;
    isLate: boolean;
    isMissingCheckout: boolean;
    actualCheckOut: Date | null;
  } | null;
  onLeave: boolean;
  workingDay: boolean;
}) {
  if (input.timesheet) {
    if (input.timesheet.isMissingCheckout || (input.timesheet.isOpen && !input.timesheet.actualCheckOut)) {
      return "MISSING_CHECKOUT";
    }
    return input.timesheet.status;
  }
  if (input.onLeave) return "ON_LEAVE";
  if (!input.workingDay) return "NON_WORKING_DAY";
  return "NOT_CHECKED_IN";
}

export const rosterService = {
  async attendanceDayRoster(
    organizationId: string,
    input: { date: string; officeId?: string; status?: string },
    scope: OfficeScope
  ) {
    const date = parseIsoDate(input.date);
    assertNotFutureDate(date);
    const { start, end } = dayBounds(date);
    const weekday = DateTime.fromJSDate(start, { zone: "utc" }).weekday;

    const employees = await prisma.employee.findMany({
      where: employeeWhere(organizationId, scope, input.officeId),
      include: {
        office: { select: { id: true, name: true } },
        schedule: { include: { days: { select: { weekday: true } } } }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    const employeeIds = employees.map((e) => e.id);
    const [timesheets, approvedLeaves, worksheets] = await prisma.$transaction([
      prisma.timesheet.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: start, lt: end } },
        include: {
          lateReason: true,
          worksheet: { select: { id: true, status: true } }
        }
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          startDate: { lte: start },
          endDate: { gte: start }
        },
        select: { employeeId: true, id: true, leaveTypeId: true, startDate: true, endDate: true }
      }),
      prisma.worksheet.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: start, lt: end } },
        select: { id: true, employeeId: true, status: true, workDescription: true }
      })
    ]);

    const timesheetByEmployee = new Map(timesheets.map((t) => [t.employeeId, t]));
    const leaveByEmployee = new Map(approvedLeaves.map((l) => [l.employeeId, l]));
    const worksheetByEmployee = new Map(worksheets.map((w) => [w.employeeId, w]));

    const items = employees.map((e) => {
      const timesheet = timesheetByEmployee.get(e.id) ?? null;
      const leave = leaveByEmployee.get(e.id) ?? null;
      const worksheet = worksheetByEmployee.get(e.id) ?? null;
      const workingDay = isWorkingDay(e.schedule, weekday);
      const attendanceState = deriveAttendanceState({
        timesheet,
        onLeave: !!leave,
        workingDay
      });

      return {
        employee: person(e),
        office: e.office ? { id: e.office.id, name: e.office.name } : null,
        attendanceState,
        isWorkingDay: workingDay,
        timesheet: timesheet
          ? {
              id: timesheet.id,
              status: timesheet.status,
              actualCheckIn: timesheet.actualCheckIn,
              actualCheckOut: timesheet.actualCheckOut,
              lateMinutes: timesheet.lateMinutes,
              workedMinutes: timesheet.workedMinutes,
              isOpen: timesheet.isOpen,
              isLate: timesheet.isLate,
              isMissingCheckout: timesheet.isMissingCheckout,
              lateReason: timesheet.lateReason
            }
          : null,
        leave: leave
          ? {
              id: leave.id,
              startDate: leave.startDate,
              endDate: leave.endDate
            }
          : null,
        worksheet: worksheet
          ? {
              id: worksheet.id,
              status: worksheet.status
            }
          : null
      };
    });

    const filtered = input.status ? items.filter((row) => row.attendanceState === input.status) : items;

    const counts = {
      totalEmployees: items.length,
      checkedIn: items.filter((r) => !!r.timesheet && r.timesheet.isOpen && !r.timesheet.isMissingCheckout).length,
      checkedOut: items.filter((r) => !!r.timesheet?.actualCheckOut && !r.timesheet.isOpen).length,
      late: items.filter((r) => r.timesheet?.isLate).length,
      onLeave: items.filter((r) => r.attendanceState === "ON_LEAVE").length,
      notCheckedIn: items.filter((r) => r.attendanceState === "NOT_CHECKED_IN").length,
      missingCheckout: items.filter((r) => r.attendanceState === "MISSING_CHECKOUT").length,
      worksheetsSubmitted: items.filter((r) => !!r.worksheet).length,
      nonWorkingDay: items.filter((r) => r.attendanceState === "NON_WORKING_DAY").length
    };

    return { date: input.date, items: filtered, counts };
  },

  async attendanceMonthSummary(
    organizationId: string,
    input: { year: number; month: number; officeId?: string },
    scope: OfficeScope
  ) {
    assertNotFutureMonth(input.year, input.month);
    const monthStart = DateTime.utc(input.year, input.month, 1).startOf("day");
    const monthEnd = monthStart.plus({ months: 1 });
    const today = DateTime.utc().startOf("day");
    const lastDay = monthEnd.minus({ days: 1 }) > today ? today : monthEnd.minus({ days: 1 });

    const employees = await prisma.employee.findMany({
      where: employeeWhere(organizationId, scope, input.officeId),
      include: {
        office: { select: { id: true, name: true } },
        schedule: { include: { days: { select: { weekday: true } } } }
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    const employeeIds = employees.map((e) => e.id);
    const start = monthStart.toJSDate();
    const endExclusive = monthEnd.toJSDate();

    const [timesheets, approvedLeaves] = await prisma.$transaction([
      prisma.timesheet.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: start, lt: endExclusive } },
        select: {
          employeeId: true,
          workDate: true,
          isLate: true,
          isOpen: true,
          isMissingCheckout: true,
          actualCheckOut: true,
          status: true
        }
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          startDate: { lt: endExclusive },
          endDate: { gte: start }
        },
        select: { employeeId: true, startDate: true, endDate: true }
      })
    ]);

    const timesheetsByEmployee = new Map<string, typeof timesheets>();
    for (const t of timesheets) {
      const list = timesheetsByEmployee.get(t.employeeId) ?? [];
      list.push(t);
      timesheetsByEmployee.set(t.employeeId, list);
    }
    const leavesByEmployee = new Map<string, typeof approvedLeaves>();
    for (const l of approvedLeaves) {
      const list = leavesByEmployee.get(l.employeeId) ?? [];
      list.push(l);
      leavesByEmployee.set(l.employeeId, list);
    }

    const items = employees.map((e) => {
      let missingCheckInDays = 0;
      let missingCheckOutDays = 0;
      let lateDays = 0;
      let leaveDays = 0;
      let presentDays = 0;
      let workingDays = 0;

      const empTimesheets = timesheetsByEmployee.get(e.id) ?? [];
      const empLeaves = leavesByEmployee.get(e.id) ?? [];
      const timesheetByDate = new Map(empTimesheets.map((t) => [t.workDate.toISOString().slice(0, 10), t]));

      for (let d = monthStart; d <= lastDay; d = d.plus({ days: 1 })) {
        const key = d.toISODate()!;
        const weekday = d.weekday;
        if (!isWorkingDay(e.schedule, weekday)) continue;
        workingDays += 1;

        const onLeave = empLeaves.some((l) => {
          const s = DateTime.fromJSDate(l.startDate, { zone: "utc" }).startOf("day");
          const en = DateTime.fromJSDate(l.endDate, { zone: "utc" }).startOf("day");
          return d >= s && d <= en;
        });
        if (onLeave) {
          leaveDays += 1;
          continue;
        }

        const timesheet = timesheetByDate.get(key);
        if (!timesheet) {
          missingCheckInDays += 1;
          continue;
        }

        presentDays += 1;
        if (timesheet.isLate) lateDays += 1;
        if (timesheet.isMissingCheckout || (timesheet.isOpen && !timesheet.actualCheckOut)) {
          missingCheckOutDays += 1;
        }
      }

      return {
        employee: person(e),
        office: e.office ? { id: e.office.id, name: e.office.name } : null,
        workingDays,
        presentDays,
        leaveDays,
        lateDays,
        missingCheckInDays,
        missingCheckOutDays
      };
    });

    const counts = {
      totalEmployees: items.length,
      employeesMissingCheckIn: items.filter((i) => i.missingCheckInDays > 0).length,
      employeesMissingCheckOut: items.filter((i) => i.missingCheckOutDays > 0).length,
      totalMissingCheckInDays: items.reduce((sum, i) => sum + i.missingCheckInDays, 0),
      totalMissingCheckOutDays: items.reduce((sum, i) => sum + i.missingCheckOutDays, 0)
    };

    return {
      year: input.year,
      month: input.month,
      from: monthStart.toISODate(),
      to: lastDay.toISODate(),
      items,
      counts
    };
  },

  async leaveDayRoster(
    organizationId: string,
    input: { date: string; officeId?: string; status?: string },
    scope: OfficeScope
  ) {
    const date = parseIsoDate(input.date);
    assertNotFutureDate(date);
    const { start, end } = dayBounds(date);

    const employees = await prisma.employee.findMany({
      where: employeeWhere(organizationId, scope, input.officeId),
      include: { office: { select: { id: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    const employeeIds = employees.map((e) => e.id);
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        startDate: { lt: end },
        endDate: { gte: start }
      },
      include: { leaveType: { select: { id: true, name: true } } },
      orderBy: { requestedAt: "desc" }
    });

    // Prefer APPROVED, then PENDING, then latest other for the day.
    const leaveByEmployee = new Map<string, (typeof leaves)[number]>();
    const rank = (status: string) => (status === "APPROVED" ? 0 : status === "PENDING" ? 1 : 2);
    for (const leave of leaves) {
      const current = leaveByEmployee.get(leave.employeeId);
      if (!current || rank(leave.status) < rank(current.status)) {
        leaveByEmployee.set(leave.employeeId, leave);
      }
    }

    const items = employees.map((e) => {
      const leave = leaveByEmployee.get(e.id) ?? null;
      const leaveState = leave ? (leave.status === "APPROVED" ? "ON_LEAVE" : leave.status) : "NONE";
      return {
        employee: person(e),
        office: e.office ? { id: e.office.id, name: e.office.name } : null,
        leaveState,
        leave: leave
          ? {
              id: leave.id,
              status: leave.status,
              startDate: leave.startDate,
              endDate: leave.endDate,
              numberOfDays: leave.numberOfDays,
              reason: leave.reason,
              leaveType: leave.leaveType
            }
          : null
      };
    });

    const filtered = input.status ? items.filter((row) => row.leaveState === input.status) : items;

    const counts = {
      totalEmployees: items.length,
      onLeave: items.filter((r) => r.leaveState === "ON_LEAVE").length,
      pending: items.filter((r) => r.leaveState === "PENDING").length,
      none: items.filter((r) => r.leaveState === "NONE").length,
      rejected: items.filter((r) => r.leaveState === "REJECTED").length,
      cancelled: items.filter((r) => r.leaveState === "CANCELLED").length
    };

    return { date: input.date, items: filtered, counts };
  },

  async worksheetDayRoster(
    organizationId: string,
    input: { date: string; officeId?: string; status?: string },
    scope: OfficeScope
  ) {
    const date = parseIsoDate(input.date);
    assertNotFutureDate(date);
    const { start, end } = dayBounds(date);

    const employees = await prisma.employee.findMany({
      where: employeeWhere(organizationId, scope, input.officeId),
      include: { office: { select: { id: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    const employeeIds = employees.map((e) => e.id);
    const [worksheets, timesheets] = await prisma.$transaction([
      prisma.worksheet.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: start, lt: end } },
        select: {
          id: true,
          employeeId: true,
          status: true,
          workDescription: true,
          submittedAt: true,
          timesheetId: true
        }
      }),
      prisma.timesheet.findMany({
        where: { employeeId: { in: employeeIds }, workDate: { gte: start, lt: end } },
        select: { id: true, employeeId: true, workedMinutes: true, status: true, actualCheckIn: true, actualCheckOut: true }
      })
    ]);

    const worksheetByEmployee = new Map(worksheets.map((w) => [w.employeeId, w]));
    const timesheetByEmployee = new Map(timesheets.map((t) => [t.employeeId, t]));

    const items = employees.map((e) => {
      const worksheet = worksheetByEmployee.get(e.id) ?? null;
      const timesheet = timesheetByEmployee.get(e.id) ?? null;
      const worksheetState = worksheet ? worksheet.status : "MISSING";
      return {
        employee: person(e),
        office: e.office ? { id: e.office.id, name: e.office.name } : null,
        worksheetState,
        worksheet: worksheet
          ? {
              id: worksheet.id,
              status: worksheet.status,
              workDescription: worksheet.workDescription,
              submittedAt: worksheet.submittedAt
            }
          : null,
        timesheet: timesheet
          ? {
              id: timesheet.id,
              workedMinutes: timesheet.workedMinutes,
              status: timesheet.status,
              actualCheckIn: timesheet.actualCheckIn,
              actualCheckOut: timesheet.actualCheckOut
            }
          : null
      };
    });

    const filtered = input.status ? items.filter((row) => row.worksheetState === input.status) : items;

    const counts = {
      totalEmployees: items.length,
      submitted: items.filter((r) => r.worksheetState === "SUBMITTED").length,
      reviewed: items.filter((r) => r.worksheetState === "REVIEWED").length,
      missing: items.filter((r) => r.worksheetState === "MISSING").length
    };

    return { date: input.date, items: filtered, counts };
  }
};
