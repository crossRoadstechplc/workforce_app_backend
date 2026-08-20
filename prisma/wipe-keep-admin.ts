import "dotenv/config";
import { prisma } from "./seed/context.js";

/**
 * Deletes all tenant data (orgs, employees, invites, attendance, etc.)
 * and keeps only SUPER_ADMIN users plus roles/permissions.
 *
 * Usage:
 *   CONFIRM_WIPE=YES npx tsx prisma/wipe-keep-admin.ts
 */
async function main() {
  if (process.env.CONFIRM_WIPE !== "YES") {
    throw new Error('Refusing to wipe. Re-run with CONFIRM_WIPE=YES');
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(databaseUrl.replace(/^postgresql:\/\//, "https://")).host;
    } catch {
      return "(unknown host)";
    }
  })();

  const superAdmins = await prisma.user.findMany({
    where: { userRoles: { some: { role: { name: "SUPER_ADMIN" } } } },
    select: { id: true, email: true }
  });

  if (!superAdmins.length) {
    throw new Error("No SUPER_ADMIN user found. Aborting wipe so the platform is not left with zero admins.");
  }

  const keepIds = superAdmins.map((user) => user.id);
  console.log(`Wiping database at ${host}`);
  console.log(`Keeping ${superAdmins.length} platform admin(s): ${superAdmins.map((user) => user.email).join(", ")}`);

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "attendance_locations",
      "late_reasons",
      "worksheets",
      "attendance_corrections",
      "timesheets",
      "leave_decisions",
      "leave_requests",
      "leave_types",
      "invites",
      "meeting_bookings",
      "meeting_rooms",
      "chat_messages",
      "chat_participants",
      "chat_conversations",
      "notifications",
      "user_devices",
      "refresh_tokens",
      "admin_offices",
      "organization_memberships",
      "employees",
      "work_schedule_days",
      "work_schedules",
      "offices",
      "organizations",
      "audit_logs"
    RESTART IDENTITY CASCADE
  `);

  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { notIn: keepIds } }
  });

  await prisma.userRole.deleteMany({
    where: { userId: { in: keepIds }, role: { name: { not: "SUPER_ADMIN" } } }
  });

  console.log(`Deleted ${deletedUsers.count} non-platform user(s)`);
  console.log("Wipe complete. Roles/permissions and SUPER_ADMIN remain.");
  console.log("Next: npm run db:seed  (set SEED_DEMO_DATA=false for admin-only, or omit it to load demo tenants)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
