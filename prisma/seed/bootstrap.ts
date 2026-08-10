import argon2 from "argon2";
import { prisma, type RoleIds } from "./context.js";
import { recordManifest } from "./builders/user.js";

export const orgAdminPermissions = [
  "employee.create", "employee.view", "employee.update", "employee.deactivate",
  "office.manage", "schedule.manage", "office_admin.manage",
  "attendance.check_in", "attendance.check_out", "attendance.view_own", "attendance.view_all", "attendance.correct",
  "worksheet.create", "worksheet.view_own", "worksheet.view_all", "worksheet.review",
  "leave.request", "leave.view_own", "leave.view_all", "leave.approve", "leave.reject",
  "notification.view", "report.view", "report.export", "audit.view"
];

export const officeAdminPermissions = [
  "employee.create", "employee.view", "employee.update", "employee.deactivate",
  "attendance.view_all", "attendance.correct",
  "worksheet.view_all", "worksheet.review",
  "leave.view_all", "leave.approve", "leave.reject",
  "notification.view", "report.view", "report.export", "audit.view"
];

export const platformPermissions = [
  "organization.manage", "org_admin.manage", "platform.report.view", "audit.view"
];

export const employeePermissions = [
  "attendance.check_in", "attendance.check_out", "attendance.view_own",
  "worksheet.create", "worksheet.view_own",
  "leave.request", "leave.view_own",
  "notification.view"
];

const allPermissionCodes = [...new Set([...orgAdminPermissions, ...officeAdminPermissions, ...platformPermissions, ...employeePermissions])];

async function grantPermissions(roleId: string, codes: string[]) {
  for (const code of codes) {
    const p = await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: p.id } },
      update: {},
      create: { roleId, permissionId: p.id }
    });
  }
}

export type BootstrapResult = {
  roleIds: RoleIds;
  superAdminEmail: string;
  superAdminPassword: string;
};

export async function bootstrap(): Promise<BootstrapResult> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis`);

  // Ensure multi-tenant leave type uniqueness (legacy DBs may still have name-only unique)
  await prisma.$executeRawUnsafe(`ALTER TABLE "leave_types" DROP CONSTRAINT IF EXISTS "leave_types_name_key"`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "leave_types_name_key"`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_organization_id_name_key" ON "leave_types"("organization_id", "name")`
  );

  const superAdmin = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: { description: "Platform owner" },
    create: { name: "SUPER_ADMIN", description: "Platform owner" }
  });
  const orgAdmin = await prisma.role.upsert({
    where: { name: "ORG_ADMIN" },
    update: { description: "Organization administrator" },
    create: { name: "ORG_ADMIN", description: "Organization administrator" }
  });
  const employee = await prisma.role.upsert({
    where: { name: "EMPLOYEE" },
    update: { description: "Employee user" },
    create: { name: "EMPLOYEE", description: "Employee user" }
  });
  const officeAdmin = await prisma.role.upsert({
    where: { name: "OFFICE_ADMIN" },
    update: { description: "Office-scoped administrator" },
    create: { name: "OFFICE_ADMIN", description: "Office-scoped administrator" }
  });

  const legacyAdmin = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (legacyAdmin) {
    const legacyAssignments = await prisma.userRole.findMany({ where: { roleId: legacyAdmin.id } });
    for (const assignment of legacyAssignments) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: assignment.userId, roleId: orgAdmin.id } },
        update: {},
        create: { userId: assignment.userId, roleId: orgAdmin.id }
      });
      await prisma.userRole.delete({ where: { userId_roleId: { userId: assignment.userId, roleId: legacyAdmin.id } } });
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: legacyAdmin.id } });
    await prisma.role.delete({ where: { id: legacyAdmin.id } });
  }

  for (const code of allPermissionCodes) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }

  await grantPermissions(superAdmin.id, [...platformPermissions, ...orgAdminPermissions]);
  await grantPermissions(orgAdmin.id, orgAdminPermissions);
  await grantPermissions(officeAdmin.id, officeAdminPermissions);
  await grantPermissions(employee.id, employeePermissions);

  const roleIds: RoleIds = { superAdmin: superAdmin.id, orgAdmin: orgAdmin.id, employee: employee.id };

  const superAdminEmail = (process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const superAdminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await argon2.hash(superAdminPassword, { type: argon2.argon2id });

  const existingSuper = await prisma.userRole.findFirst({
    where: { role: { name: "SUPER_ADMIN" } },
    include: { user: true }
  });

  if (!existingSuper) {
    const user = await prisma.user.upsert({
      where: { email: superAdminEmail },
      update: { passwordHash, mustChangePassword: true },
      create: { email: superAdminEmail, passwordHash, mustChangePassword: true }
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: orgAdmin.id } });
    await prisma.organizationMembership.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superAdmin.id } },
      update: {},
      create: { userId: user.id, roleId: superAdmin.id }
    });
    console.log(`Seeded SUPER_ADMIN: ${superAdminEmail}`);
  } else {
    console.log(`SUPER_ADMIN already exists: ${existingSuper.user.email}`);
  }

  recordManifest({
    role: "SUPER_ADMIN",
    email: existingSuper?.user.email ?? superAdminEmail,
    password: superAdminPassword,
    notes: "Platform console — Organizations, Org Admins"
  });

  return { roleIds, superAdminEmail: existingSuper?.user.email ?? superAdminEmail, superAdminPassword };
}
