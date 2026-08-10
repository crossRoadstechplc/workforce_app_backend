import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { OrganizationFixture } from "../types.js";
import type { RoleIds } from "../context.js";
import type { OfficeMap, ScheduleMap } from "./office.js";
import { recordManifest, upsertUserWithRole } from "./user.js";

export type EmployeeMap = Map<string, { id: string; userId: string; officeId: string; scheduleId: string }>;

export async function seedOrgAdmin(
  prisma: PrismaClient,
  roleIds: RoleIds,
  organizationId: string,
  organizationSlug: string,
  fixture: OrganizationFixture,
  demoPasswordHash: string,
  demoPassword: string
) {
  const user = await upsertUserWithRole(prisma, roleIds, {
    email: fixture.orgAdmin.email,
    passwordHash: demoPasswordHash,
    role: "ORG_ADMIN",
    mustChangePassword: false,
    organizationId
  });

  recordManifest({
    role: "ORG_ADMIN",
    email: fixture.orgAdmin.email,
    password: demoPassword,
    organization: organizationSlug,
    notes: `Org admin for ${fixture.name}`
  });

  return user;
}

export async function seedEmployees(
  prisma: PrismaClient,
  roleIds: RoleIds,
  organizationId: string,
  organizationSlug: string,
  fixture: OrganizationFixture,
  offices: OfficeMap,
  schedules: ScheduleMap,
  demoPasswordHash: string,
  demoPassword: string
) {
  const employees: EmployeeMap = new Map();
  const startDate = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 15));

  for (const e of fixture.employees) {
    const office = offices.get(e.officeKey);
    const schedule = schedules.get(e.scheduleKey);
    if (!office || !schedule) throw new Error(`Invalid office/schedule key for employee ${e.code}`);

    const user = await upsertUserWithRole(prisma, roleIds, {
      email: e.email,
      passwordHash: demoPasswordHash,
      role: "EMPLOYEE",
      mustChangePassword: false,
      organizationId
    });

    const existing = await prisma.employee.findUnique({
      where: { organizationId_employeeCode: { organizationId, employeeCode: e.code } }
    });

    const employee = existing
      ? await prisma.employee.update({
          where: { id: existing.id },
          data: {
            officeId: office.id,
            scheduleId: schedule.id,
            firstName: e.firstName,
            middleName: e.middleName,
            lastName: e.lastName,
            phone: e.phone,
            jobTitle: e.jobTitle,
            department: e.department,
            status: "ACTIVE"
          }
        })
      : await prisma.employee.create({
          data: {
            organizationId,
            userId: user.id,
            employeeCode: e.code,
            officeId: office.id,
            scheduleId: schedule.id,
            firstName: e.firstName,
            middleName: e.middleName,
            lastName: e.lastName,
            phone: e.phone,
            jobTitle: e.jobTitle,
            department: e.department,
            employmentStartDate: startDate,
            status: "ACTIVE"
          }
        });

    employees.set(e.code, { id: employee.id, userId: user.id, officeId: office.id, scheduleId: schedule.id });

    recordManifest({
      role: "EMPLOYEE",
      email: e.email,
      password: demoPassword,
      organization: organizationSlug,
      employeeCode: e.code,
      notes: e.notes
    });
  }

  return employees;
}
