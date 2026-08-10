import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { RoleIds } from "../context.js";
import { manifest } from "../context.js";

export async function upsertUserWithRole(
  prisma: PrismaClient,
  roleIds: RoleIds,
  input: {
    email: string;
    passwordHash: string;
    role: "SUPER_ADMIN" | "ORG_ADMIN" | "EMPLOYEE";
    mustChangePassword: boolean;
    organizationId?: string;
    manifestNotes?: string;
    employeeCode?: string;
    organizationSlug?: string;
  }
) {
  const email = input.email.toLowerCase();
  const roleId =
    input.role === "SUPER_ADMIN" ? roleIds.superAdmin : input.role === "ORG_ADMIN" ? roleIds.orgAdmin : roleIds.employee;

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: input.passwordHash, mustChangePassword: input.mustChangePassword, status: "ACTIVE" },
    create: { email, passwordHash: input.passwordHash, mustChangePassword: input.mustChangePassword, status: "ACTIVE" }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId } },
    update: {},
    create: { userId: user.id, roleId }
  });

  if (input.role === "SUPER_ADMIN") {
    await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: { in: [roleIds.orgAdmin, roleIds.employee] } } });
    await prisma.organizationMembership.deleteMany({ where: { userId: user.id } });
  }

  if (input.organizationId && input.role !== "SUPER_ADMIN") {
    await prisma.organizationMembership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: input.organizationId } },
      update: {},
      create: { userId: user.id, organizationId: input.organizationId }
    });
  }

  return user;
}

export function recordManifest(entry: {
  role: string;
  email: string;
  password: string;
  organization?: string;
  employeeCode?: string;
  notes?: string;
}) {
  const existing = manifest.find((m) => m.email === entry.email && m.role === entry.role);
  if (existing) {
    Object.assign(existing, entry);
  } else {
    manifest.push(entry);
  }
}
