import { DateTime } from "luxon";
import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { OrganizationFixture } from "../types.js";
import type { EmployeeMap } from "./employee.js";
import type { OfficeMap, ScheduleMap } from "./office.js";

type AttendanceStatus = OrganizationFixture["attendanceScenarios"][number]["status"];

function workDateUtc(daysAgo: number) {
  const d = DateTime.now().setZone("Africa/Addis_Ababa").minus({ days: daysAgo }).startOf("day");
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

function scheduledInstant(workDate: Date, hhmm: string, timezone: string) {
  const dt = DateTime.fromJSDate(workDate, { zone: "utc" }).setZone(timezone, { keepLocalTime: true });
  const [h, m] = hhmm.split(":").map(Number);
  return dt.set({ hour: h, minute: m, second: 0, millisecond: 0 }).toUTC().toJSDate();
}

function dayTimesFor(
  schedule: ScheduleMap extends Map<string, infer V> ? V : never,
  workDate: Date
) {
  const weekday = DateTime.fromJSDate(workDate, { zone: "utc" }).setZone(schedule.timezone, { keepLocalTime: true }).weekday;
  const day = schedule.days.find((d) => d.weekday === weekday);
  return {
    checkIn: day?.checkIn ?? schedule.checkIn,
    checkOut: day?.checkOut ?? schedule.checkOut
  };
}

function buildTimesheetData(
  scenario: OrganizationFixture["attendanceScenarios"][number],
  employee: EmployeeMap extends Map<string, infer V> ? V : never,
  office: OfficeMap extends Map<string, infer V> ? V : never,
  schedule: ScheduleMap extends Map<string, infer V> ? V : never,
  orgSlug: string
) {
  const workDate = workDateUtc(scenario.daysAgo);
  const times = dayTimesFor(schedule, workDate);
  const scheduledIn = scheduledInstant(workDate, times.checkIn, schedule.timezone);
  let scheduledOut = scheduledInstant(workDate, times.checkOut, schedule.timezone);
  if (scheduledOut <= scheduledIn) {
    scheduledOut = DateTime.fromJSDate(scheduledOut).plus({ days: 1 }).toJSDate();
  }

  const lateMinutes = scenario.lateMinutes ?? (scenario.status === "completed_late" ? 15 : 0);
  const actualCheckIn = DateTime.fromJSDate(scheduledIn).plus({ minutes: lateMinutes }).toJSDate();

  let actualCheckOut: Date | null = null;
  let workedMinutes = 0;
  let status: "OPEN" | "PRESENT_ON_TIME" | "PRESENT_LATE" | "COMPLETED_ON_TIME" | "COMPLETED_LATE" | "MISSING_CHECKOUT" = "OPEN";
  let isOpen = true;
  let isLate = lateMinutes > 0;
  let isMissingCheckout = false;

  switch (scenario.status as AttendanceStatus) {
    case "open":
      status = isLate ? "PRESENT_LATE" : "PRESENT_ON_TIME";
      isOpen = true;
      break;
    case "completed_on_time":
      actualCheckOut = scheduledOut;
      workedMinutes = Math.max(0, Math.floor((actualCheckOut.getTime() - actualCheckIn.getTime()) / 60000));
      status = isLate ? "COMPLETED_LATE" : "COMPLETED_ON_TIME";
      isOpen = false;
      break;
    case "completed_late":
      actualCheckOut = DateTime.fromJSDate(scheduledOut).plus({ minutes: 10 }).toJSDate();
      workedMinutes = Math.max(0, Math.floor((actualCheckOut.getTime() - actualCheckIn.getTime()) / 60000));
      status = "COMPLETED_LATE";
      isLate = true;
      isOpen = false;
      break;
    case "missing_checkout":
      actualCheckOut = null;
      workedMinutes = 0;
      status = "MISSING_CHECKOUT";
      isMissingCheckout = true;
      isOpen = true;
      break;
  }

  const idempotencyKey = `seed-${orgSlug}-${scenario.employeeCode}-${scenario.daysAgo}`;

  return {
    workDate,
    scheduledIn,
    scheduledOut,
    actualCheckIn,
    actualCheckOut,
    lateMinutes: isLate ? lateMinutes : 0,
    workedMinutes,
    status,
    isOpen,
    isLate,
    isMissingCheckout,
    idempotencyKey,
    checkInTime: times.checkIn,
    checkOutTime: times.checkOut,
    office,
    schedule
  };
}

export async function seedAttendanceScenarios(
  prisma: PrismaClient,
  orgSlug: string,
  fixture: OrganizationFixture,
  employees: EmployeeMap,
  offices: OfficeMap,
  schedules: ScheduleMap,
  orgAdminUserId: string
) {
  for (const scenario of fixture.attendanceScenarios) {
    const emp = employees.get(scenario.employeeCode);
    const empFixture = fixture.employees.find((e) => e.code === scenario.employeeCode);
    if (!emp || !empFixture) continue;

    const office = offices.get(empFixture.officeKey)!;
    const schedule = schedules.get(empFixture.scheduleKey)!;
    const data = buildTimesheetData(scenario, emp, office, schedule, orgSlug);

    const existing = await prisma.timesheet.findUnique({
      where: { employeeId_workDate: { employeeId: emp.id, workDate: data.workDate } }
    });

    const timesheet = existing
      ? await prisma.timesheet.update({
          where: { id: existing.id },
          data: {
            officeId: emp.officeId,
            scheduleId: emp.scheduleId,
            scheduledCheckIn: data.scheduledIn,
            scheduledCheckOut: data.scheduledOut,
            actualCheckIn: data.actualCheckIn,
            actualCheckOut: data.actualCheckOut,
            lateMinutes: data.lateMinutes,
            workedMinutes: data.workedMinutes,
            status: data.status,
            isOpen: data.isOpen,
            isLate: data.isLate,
            isMissingCheckout: data.isMissingCheckout,
            scheduleCheckInTime: data.checkInTime,
            scheduleCheckOutTime: data.checkOutTime,
            scheduleLateGraceMinutes: schedule.lateGraceMinutes,
            officeLatitude: office.lat,
            officeLongitude: office.lng,
            officeAllowedRadiusMeters: office.radiusMeters,
            officeMaximumAccuracyMeters: office.maximumAccuracyMeters,
            timezone: schedule.timezone
          }
        })
      : await prisma.timesheet.create({
          data: {
            employeeId: emp.id,
            officeId: emp.officeId,
            scheduleId: emp.scheduleId,
            workDate: data.workDate,
            scheduledCheckIn: data.scheduledIn,
            scheduledCheckOut: data.scheduledOut,
            actualCheckIn: data.actualCheckIn,
            actualCheckOut: data.actualCheckOut,
            lateMinutes: data.lateMinutes,
            workedMinutes: data.workedMinutes,
            status: data.status,
            isOpen: data.isOpen,
            isLate: data.isLate,
            isMissingCheckout: data.isMissingCheckout,
            checkInIdempotencyKey: data.idempotencyKey,
            checkOutIdempotencyKey: data.actualCheckOut ? `${data.idempotencyKey}-out` : null,
            scheduleCheckInTime: data.checkInTime,
            scheduleCheckOutTime: data.checkOutTime,
            scheduleLateGraceMinutes: schedule.lateGraceMinutes,
            officeLatitude: office.lat,
            officeLongitude: office.lng,
            officeAllowedRadiusMeters: office.radiusMeters,
            officeMaximumAccuracyMeters: office.maximumAccuracyMeters,
            timezone: schedule.timezone
          }
        });

    if (scenario.lateReason && data.isLate) {
      await prisma.lateReason.upsert({
        where: { timesheetId: timesheet.id },
        update: { reasonType: "OTHER", reasonDescription: scenario.lateReason, submittedAt: data.actualCheckIn },
        create: {
          timesheetId: timesheet.id,
          employeeId: emp.id,
          reasonType: "OTHER",
          reasonDescription: scenario.lateReason,
          submittedAt: data.actualCheckIn
        }
      });
    }

    if (scenario.worksheet && data.actualCheckOut) {
      const worksheetStatus = scenario.worksheetReviewed ? "REVIEWED" : "SUBMITTED";
      await prisma.worksheet.upsert({
        where: { timesheetId: timesheet.id },
        update: {
          workDescription: `Demo work for ${scenario.employeeCode} on ${data.workDate.toISOString().slice(0, 10)}`,
          status: worksheetStatus,
          reviewedBy: scenario.worksheetReviewed ? orgAdminUserId : null,
          reviewedAt: scenario.worksheetReviewed ? new Date() : null
        },
        create: {
          timesheetId: timesheet.id,
          employeeId: emp.id,
          workDate: data.workDate,
          workDescription: `Demo work for ${scenario.employeeCode} on ${data.workDate.toISOString().slice(0, 10)}`,
          status: worksheetStatus,
          submittedAt: data.actualCheckOut,
          reviewedBy: scenario.worksheetReviewed ? orgAdminUserId : null,
          reviewedAt: scenario.worksheetReviewed ? new Date() : null
        }
      });
    }

    // Minimal check-in location for completed/open records
    const locCount = await prisma.attendanceLocation.count({ where: { timesheetId: timesheet.id, type: "CHECK_IN" } });
    if (locCount === 0) {
      await prisma.attendanceLocation.create({
        data: {
          timesheetId: timesheet.id,
          type: "CHECK_IN",
          latitude: office.lat,
          longitude: office.lng,
          accuracyMeters: 10,
          distanceFromOfficeMeters: 5,
          allowedRadiusMeters: office.radiusMeters,
          isInsideRadius: true,
          capturedAt: data.actualCheckIn,
          serverReceivedAt: data.actualCheckIn
        }
      });
    }
  }

  // Bulk history: last 14 weekdays for first 4 employees (on-time completed + worksheet)
  const bulkCodes = fixture.employees.slice(0, 4).map((e) => e.code);
  for (const code of bulkCodes) {
    const emp = employees.get(code)!;
    const empFixture = fixture.employees.find((e) => e.code === code)!;
    const office = offices.get(empFixture.officeKey)!;
    const schedule = schedules.get(empFixture.scheduleKey)!;

    for (let daysAgo = 3; daysAgo <= 14; daysAgo++) {
      const wd = DateTime.now().setZone(schedule.timezone).minus({ days: daysAgo });
      if (!schedule.workingDays.includes(wd.weekday)) continue;

      const scenarioKey = `${code}-${daysAgo}`;
      if (fixture.attendanceScenarios.some((s) => s.employeeCode === code && s.daysAgo === daysAgo)) continue;

      const data = buildTimesheetData(
        { employeeCode: code, daysAgo, status: "completed_on_time", worksheet: daysAgo % 2 === 0, worksheetReviewed: daysAgo % 4 === 0 },
        emp,
        office,
        schedule,
        orgSlug
      );

      const existing = await prisma.timesheet.findUnique({
        where: { employeeId_workDate: { employeeId: emp.id, workDate: data.workDate } }
      });
      if (existing) continue;

      const timesheet = await prisma.timesheet.create({
        data: {
          employeeId: emp.id,
          officeId: emp.officeId,
          scheduleId: emp.scheduleId,
          workDate: data.workDate,
          scheduledCheckIn: data.scheduledIn,
          scheduledCheckOut: data.scheduledOut,
          actualCheckIn: data.actualCheckIn,
          actualCheckOut: data.actualCheckOut,
          lateMinutes: 0,
          workedMinutes: data.workedMinutes,
          status: "COMPLETED_ON_TIME",
          isOpen: false,
          isLate: false,
          isMissingCheckout: false,
          checkInIdempotencyKey: `seed-${orgSlug}-${scenarioKey}`,
          checkOutIdempotencyKey: `seed-${orgSlug}-${scenarioKey}-out`,
          scheduleCheckInTime: data.checkInTime,
          scheduleCheckOutTime: data.checkOutTime,
          scheduleLateGraceMinutes: schedule.lateGraceMinutes,
          officeLatitude: office.lat,
          officeLongitude: office.lng,
          officeAllowedRadiusMeters: office.radiusMeters,
          officeMaximumAccuracyMeters: office.maximumAccuracyMeters,
          timezone: schedule.timezone
        }
      });

      if (daysAgo % 2 === 0 && data.actualCheckOut) {
        await prisma.worksheet.create({
          data: {
            timesheetId: timesheet.id,
            employeeId: emp.id,
            workDate: data.workDate,
            workDescription: `Routine tasks — ${code}`,
            status: daysAgo % 4 === 0 ? "REVIEWED" : "SUBMITTED",
            submittedAt: data.actualCheckOut,
            reviewedBy: daysAgo % 4 === 0 ? orgAdminUserId : null,
            reviewedAt: daysAgo % 4 === 0 ? new Date() : null
          }
        });
      }
    }
  }
}
