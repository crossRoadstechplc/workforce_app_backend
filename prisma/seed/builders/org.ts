import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { OrganizationFixture } from "../types.js";

export async function seedOrganization(prisma: PrismaClient, fixture: OrganizationFixture) {
  const organization = await prisma.organization.upsert({
    where: { slug: fixture.slug },
    update: { name: fixture.name, isActive: true },
    create: { name: fixture.name, slug: fixture.slug, isActive: true }
  });

  for (const name of fixture.leaveTypes) {
    const key = name.trim().toLowerCase();
    const code =
      key === "annual leave" ? "ANNUAL" :
      key === "sick leave" ? "SICK" :
      key === "emergency leave" ? "EMERGENCY" :
      key === "unpaid leave" ? "UNPAID" :
      "OTHER";
    const tracksBalance = code === "ANNUAL";
    await prisma.leaveType.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { isActive: true, code, tracksBalance },
      create: { organizationId: organization.id, name, code, tracksBalance, isActive: true }
    });
  }

  return organization;
}

export async function getLeaveTypeMap(prisma: PrismaClient, organizationId: string) {
  const types = await prisma.leaveType.findMany({ where: { organizationId, isActive: true } });
  return new Map(types.map((t) => [t.name, t.id]));
}
