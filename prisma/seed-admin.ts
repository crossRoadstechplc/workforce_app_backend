import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "./seed/context.js";
import {
  employeePermissions,
  officeAdminPermissions,
  orgAdminPermissions,
  platformPermissions
} from "./seed/bootstrap.js";

/**
 * Production seed — roles, permissions and a single SUPER_ADMIN account.
 * No organizations, offices, employees or demo data are created.
 *
 * Usage:
 *   npm run db:seed:admin                 (local / tsx)
 *   npm run db:seed:admin:prod            (server / compiled dist)
 *
 * Override the credentials with ADMIN_EMAIL / ADMIN_PASSWORD (or the legacy
 * INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD) before running on a real server.
 */

const DEFAULT_ADMIN_EMAIL = "admin@spx.com";
const DEFAULT_ADMIN_PASSWORD = "password123";

const roleDefinitions = [
  { name: "SUPER_ADMIN", description: "Platform owner", permissions: [...platformPermissions, ...orgAdminPermissions] },
  { name: "ORG_ADMIN", description: "Organization administrator", permissions: orgAdminPermissions },
  { name: "OFFICE_ADMIN", description: "Office-scoped administrator", permissions: officeAdminPermissions },
  { name: "EMPLOYEE", description: "Employee user", permissions: employeePermissions }
] as const;

async function ensureRolesAndPermissions() {
  const codes = [...new Set(roleDefinitions.flatMap((role) => role.permissions))];
  const permissionIds = new Map<string, string>();
  for (const code of codes) {
    const permission = await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
    permissionIds.set(code, permission.id);
  }

  const roleIds = new Map<string, string>();
  for (const definition of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name: definition.name },
      update: { description: definition.description },
      create: { name: definition.name, description: definition.description }
    });
    roleIds.set(definition.name, role.id);

    for (const code of definition.permissions) {
      const permissionId = permissionIds.get(code)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId }
      });
    }
  }

  return roleIds;
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? process.env.INITIAL_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? process.env.INITIAL_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const mustChangePassword = process.env.ADMIN_MUST_CHANGE_PASSWORD === "true";

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis`);

  const roleIds = await ensureRolesAndPermissions();
  const superAdminRoleId = roleIds.get("SUPER_ADMIN")!;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, mustChangePassword, status: "ACTIVE" },
    create: { email, passwordHash, mustChangePassword, status: "ACTIVE" }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRoleId } },
    update: {},
    create: { userId: user.id, roleId: superAdminRoleId }
  });

  // A platform admin owns no tenant scope.
  await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: { not: superAdminRoleId } } });
  await prisma.organizationMembership.deleteMany({ where: { userId: user.id } });
  await prisma.adminOrganization.deleteMany({ where: { userId: user.id } });

  const otherAdmins = await prisma.user.count({
    where: { id: { not: user.id }, userRoles: { some: { role: { name: "SUPER_ADMIN" } } } }
  });

  console.log("Admin seed complete");
  console.log(`  SUPER_ADMIN : ${email}`);
  console.log(`  password    : ${password}`);
  console.log(`  first login : ${mustChangePassword ? "password change required" : "ready to use"}`);
  if (otherAdmins > 0) {
    console.log(`  note        : ${otherAdmins} other SUPER_ADMIN account(s) already exist and were left untouched`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
