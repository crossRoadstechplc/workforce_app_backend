import argon2 from "argon2";
import type { DemoFixture } from "./types.js";
import { prisma } from "./context.js";
import type { BootstrapResult } from "./bootstrap.js";
import { seedOrganization, getLeaveTypeMap } from "./builders/org.js";
import { seedOfficesAndSchedules } from "./builders/office.js";
import { seedOrgAdmin, seedEmployees } from "./builders/employee.js";
import { seedAttendanceScenarios } from "./builders/attendance.js";
import { seedLeaveScenarios } from "./builders/leave.js";
import { seedEvaluationTemplate } from "./builders/evaluation.js";

export async function seedDemo(fixture: DemoFixture, bootstrap: BootstrapResult) {
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Demo123!";
  const demoPasswordHash = await argon2.hash(demoPassword, { type: argon2.argon2id });

  console.log(`Seeding demo data (${fixture.organizations.length} organizations)...`);

  for (const orgFixture of fixture.organizations) {
    const organization = await seedOrganization(prisma, orgFixture);
    const { offices, schedules } = await seedOfficesAndSchedules(prisma, organization.id, orgFixture);
    const orgAdmin = await seedOrgAdmin(
      prisma,
      bootstrap.roleIds,
      organization.id,
      orgFixture.slug,
      orgFixture,
      demoPasswordHash,
      demoPassword
    );
    const employees = await seedEmployees(
      prisma,
      bootstrap.roleIds,
      organization.id,
      orgFixture.slug,
      orgFixture,
      offices,
      schedules,
      demoPasswordHash,
      demoPassword
    );
    await seedAttendanceScenarios(prisma, orgFixture.slug, orgFixture, employees, offices, schedules, orgAdmin.id);
    const leaveTypeMap = await getLeaveTypeMap(prisma, organization.id);
    await seedLeaveScenarios(prisma, organization.id, orgFixture, employees, leaveTypeMap, orgAdmin.id);
    await seedEvaluationTemplate(prisma, organization.id);
    console.log(`  ✓ ${orgFixture.name} (${orgFixture.slug})`);
  }
}
