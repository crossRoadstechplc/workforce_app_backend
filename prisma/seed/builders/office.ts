import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { OrganizationFixture } from "../types.js";

export type OfficeMap = Map<string, { id: string; lat: number; lng: number; radiusMeters: number; maximumAccuracyMeters: number; timezone: string }>;
export type ScheduleDay = { weekday: number; checkIn: string; checkOut: string };
export type ScheduleMap = Map<
  string,
  { id: string; checkIn: string; checkOut: string; lateGraceMinutes: number; workingDays: number[]; days: ScheduleDay[]; timezone: string }
>;

function resolveDays(s: OrganizationFixture["schedules"][number]): ScheduleDay[] {
  if (s.days?.length) {
    return [...s.days].sort((a, b) => a.weekday - b.weekday);
  }
  return s.workingDays
    .slice()
    .sort((a, b) => a - b)
    .map((weekday) => ({ weekday, checkIn: s.checkIn, checkOut: s.checkOut }));
}

export async function seedOfficesAndSchedules(prisma: PrismaClient, organizationId: string, fixture: OrganizationFixture) {
  const offices: OfficeMap = new Map();
  const schedules: ScheduleMap = new Map();

  for (const o of fixture.offices) {
    const existing = await prisma.office.findFirst({ where: { organizationId, name: o.name } });
    const office = existing
      ? await prisma.office.update({
          where: { id: existing.id },
          data: {
            address: o.address,
            latitude: o.lat,
            longitude: o.lng,
            allowedRadiusMeters: o.radiusMeters,
            maximumAccuracyMeters: o.maximumAccuracyMeters,
            timezone: o.timezone,
            isActive: true
          }
        })
      : await prisma.office.create({
          data: {
            organizationId,
            name: o.name,
            address: o.address,
            latitude: o.lat,
            longitude: o.lng,
            allowedRadiusMeters: o.radiusMeters,
            maximumAccuracyMeters: o.maximumAccuracyMeters,
            timezone: o.timezone,
            isActive: true
          }
        });
    offices.set(o.key, {
      id: office.id,
      lat: o.lat,
      lng: o.lng,
      radiusMeters: o.radiusMeters,
      maximumAccuracyMeters: o.maximumAccuracyMeters,
      timezone: o.timezone
    });
  }

  for (const s of fixture.schedules) {
    const days = resolveDays(s);
    const workingDays = days.map((d) => d.weekday);
    const existing = await prisma.workSchedule.findFirst({ where: { organizationId, name: s.name } });
    const schedule = existing
      ? await prisma.workSchedule.update({
          where: { id: existing.id },
          data: {
            checkInTime: days[0]!.checkIn,
            checkOutTime: days[0]!.checkOut,
            lateGraceMinutes: s.lateGraceMinutes,
            workingDays,
            timezone: s.timezone,
            isActive: true
          }
        })
      : await prisma.workSchedule.create({
          data: {
            organizationId,
            name: s.name,
            checkInTime: days[0]!.checkIn,
            checkOutTime: days[0]!.checkOut,
            lateGraceMinutes: s.lateGraceMinutes,
            workingDays,
            timezone: s.timezone,
            isActive: true
          }
        });

    await prisma.workScheduleDay.deleteMany({ where: { scheduleId: schedule.id } });
    await prisma.workScheduleDay.createMany({
      data: days.map((d) => ({
        scheduleId: schedule.id,
        weekday: d.weekday,
        checkInTime: d.checkIn,
        checkOutTime: d.checkOut
      }))
    });

    schedules.set(s.key, {
      id: schedule.id,
      checkIn: days[0]!.checkIn,
      checkOut: days[0]!.checkOut,
      lateGraceMinutes: s.lateGraceMinutes,
      workingDays,
      days,
      timezone: s.timezone
    });
  }

  return { offices, schedules };
}
