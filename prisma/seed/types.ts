import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const orgAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

const officeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().int().positive().default(150),
  maximumAccuracyMeters: z.number().int().positive().default(100),
  timezone: z.string().default("Africa/Addis_Ababa")
});

const scheduleDaySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  checkIn: z.string().regex(/^\d{2}:\d{2}$/),
  checkOut: z.string().regex(/^\d{2}:\d{2}$/)
});

const scheduleSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  checkIn: z.string().regex(/^\d{2}:\d{2}$/),
  checkOut: z.string().regex(/^\d{2}:\d{2}$/),
  lateGraceMinutes: z.number().int().nonnegative().default(0),
  workingDays: z.array(z.number().int().min(1).max(7)),
  /** Optional per-day times; when omitted, checkIn/checkOut apply to every working day */
  days: z.array(scheduleDaySchema).optional(),
  timezone: z.string().default("Africa/Addis_Ababa")
});

const employeeSchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  officeKey: z.string().min(1),
  scheduleKey: z.string().min(1),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional()
});

const attendanceScenarioSchema = z.object({
  employeeCode: z.string().min(1),
  daysAgo: z.number().int().nonnegative(),
  status: z.enum(["open", "completed_on_time", "completed_late", "missing_checkout"]),
  worksheet: z.boolean().optional(),
  worksheetReviewed: z.boolean().optional(),
  lateReason: z.string().optional(),
  lateMinutes: z.number().int().nonnegative().optional()
});

const leaveScenarioSchema = z.object({
  employeeCode: z.string().min(1),
  leaveType: z.string().min(1),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
  startDaysFromNow: z.number().int().optional(),
  startDaysAgo: z.number().int().optional(),
  days: z.number().int().positive(),
  reason: z.string().optional(),
  decisionReason: z.string().optional()
});

export const organizationFixtureSchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(2),
  orgAdmin: orgAdminSchema,
  leaveTypes: z.array(z.string().min(1)),
  offices: z.array(officeSchema).min(1),
  schedules: z.array(scheduleSchema).min(1),
  employees: z.array(employeeSchema).min(1),
  attendanceScenarios: z.array(attendanceScenarioSchema).default([]),
  leaveScenarios: z.array(leaveScenarioSchema).default([])
});

export const demoFixtureSchema = z.object({
  organizations: z.array(organizationFixtureSchema).min(1)
});

export type DemoFixture = z.infer<typeof demoFixtureSchema>;
export type OrganizationFixture = z.infer<typeof organizationFixtureSchema>;

export function loadFixture(): DemoFixture {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "data", "demo.fixture.json"), "utf8");
  return demoFixtureSchema.parse(JSON.parse(raw));
}
