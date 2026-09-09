import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { ROLE, type AuthContext } from "../../shared/tenancy.js";
import { DEFAULT_PERMISSION_MATRIX } from "./default-matrix.js";
import { ensureMembership } from "./membership.service.js";
import { PERMISSION_ROLE_TO_DB, type TtPermissionRoleDb } from "./roles.js";
import type { PermissionRoleLabel } from "./types.js";

function seedPermissionRows(workspaceId: string) {
  const rows: Array<{
    workspaceId: string;
    role: TtPermissionRoleDb;
    actionId: string;
    allowed: boolean;
  }> = [];

  for (const [roleLabel, actions] of Object.entries(DEFAULT_PERMISSION_MATRIX)) {
    const role = PERMISSION_ROLE_TO_DB[roleLabel as PermissionRoleLabel];
    for (const [actionId, allowed] of Object.entries(actions)) {
      rows.push({ workspaceId, role, actionId, allowed: Boolean(allowed) });
    }
  }
  return rows;
}

async function uniqueDisplayName(
  used: Set<string>,
  base: string,
  email: string
): Promise<string> {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const suffix = email.split("@")[0] ?? "user";
  let candidate = `${base} (${suffix})`;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base} (${suffix}-${i})`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

export const enablementService = {
  async status(organizationId: string) {
    const workspace = await prisma.ttWorkspace.findUnique({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        enabledAt: true,
        revision: true,
        _count: { select: { staffMembers: true } }
      }
    });
    if (!workspace) {
      return { enabled: false as const };
    }
    return {
      enabled: true as const,
      workspaceId: workspace.id,
      name: workspace.name,
      enabledAt: workspace.enabledAt.toISOString(),
      revision: workspace.revision,
      staffCount: workspace._count.staffMembers
    };
  },

  async summary(organizationId: string) {
    const workspace = await prisma.ttWorkspace.findUnique({
      where: { organizationId },
      select: { id: true, name: true, enabledAt: true, revision: true }
    });
    if (!workspace) {
      return { enabled: false as const };
    }

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    const [
      staffByRole,
      taskByStatus,
      projectCount,
      orgTeamCount,
      scheduleCount,
      overdueTasks,
      recentTasks,
      highPriorityOpen,
      staffSample
    ] = await Promise.all([
      prisma.ttStaffMember.groupBy({
        by: ["permissionRole"],
        where: { workspaceId: workspace.id },
        _count: { _all: true }
      }),
      prisma.ttTask.groupBy({
        by: ["status"],
        where: { workspaceId: workspace.id },
        _count: { _all: true }
      }),
      prisma.ttProject.count({ where: { workspaceId: workspace.id } }),
      prisma.ttOrgTeam.count({ where: { workspaceId: workspace.id } }),
      prisma.ttScheduleEvent.count({
        where: { workspaceId: workspace.id, end: { gte: today } }
      }),
      prisma.ttTask.findMany({
        where: {
          workspaceId: workspace.id,
          status: { not: "DONE" },
          due: { not: "" }
        },
        select: {
          id: true,
          title: true,
          due: true,
          priority: true,
          status: true,
          project: { select: { name: true } },
          owners: {
            orderBy: { sortOrder: "asc" },
            take: 3,
            include: { staffMember: { select: { displayName: true } } }
          }
        },
        take: 40
      }),
      prisma.ttTask.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          due: true,
          updatedAt: true,
          project: { select: { name: true } },
          owners: {
            orderBy: { sortOrder: "asc" },
            take: 2,
            include: { staffMember: { select: { displayName: true } } }
          }
        }
      }),
      prisma.ttTask.count({
        where: {
          workspaceId: workspace.id,
          status: { not: "DONE" },
          priority: "High"
        }
      }),
      prisma.ttStaffMember.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { sortOrder: "asc" },
        take: 8,
        select: {
          id: true,
          displayName: true,
          jobTitle: true,
          permissionRole: true
        }
      })
    ]);

    const roleCounts = Object.fromEntries(
      staffByRole.map((row) => [row.permissionRole, row._count._all])
    ) as Record<string, number>;
    const statusCounts = Object.fromEntries(
      taskByStatus.map((row) => [row.status, row._count._all])
    ) as Record<string, number>;

    const toDo = statusCounts.TO_DO ?? 0;
    const inProgress = statusCounts.IN_PROGRESS ?? 0;
    const done = statusCounts.DONE ?? 0;
    const openTasks = toDo + inProgress;
    const staffCount = Object.values(roleCounts).reduce((sum, n) => sum + n, 0);

    const overdue = overdueTasks
      .filter((task) => {
        const due = task.due.trim();
        if (!due) return false;
        // due is stored as free-form string; prefer ISO / yyyy-mm-dd prefixes
        const key = due.slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(key) && key < todayKey;
      })
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        title: task.title,
        due: task.due,
        priority: task.priority,
        status: task.status,
        project: task.project.name,
        owners: task.owners.map((o) => o.staffMember.displayName)
      }));

    const recommendations: string[] = [];
    if (openTasks === 0 && projectCount === 0) {
      recommendations.push("Create a first project, then add tasks so teams have a shared board.");
    }
    if (overdue.length > 0) {
      recommendations.push(
        `${overdue.length} open task${overdue.length === 1 ? "" : "s"} look overdue — review owners and due dates.`
      );
    }
    if (highPriorityOpen > 0) {
      recommendations.push(
        `${highPriorityOpen} high-priority task${highPriorityOpen === 1 ? "" : "s"} still open.`
      );
    }
    if (inProgress > toDo * 2 && inProgress > 5) {
      recommendations.push("Many tasks are In Progress — consider focusing the board before starting more.");
    }
    if (staffCount > 0 && projectCount === 0) {
      recommendations.push("Staff are ready; set up projects and assign members to unlock visibility.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Board looks healthy. Continue into Task Operations to manage day-to-day work.");
    }

    return {
      enabled: true as const,
      workspaceId: workspace.id,
      name: workspace.name,
      enabledAt: workspace.enabledAt.toISOString(),
      revision: workspace.revision,
      counts: {
        staff: staffCount,
        projects: projectCount,
        orgTeams: orgTeamCount,
        upcomingSchedule: scheduleCount,
        tasks: {
          toDo,
          inProgress,
          done,
          open: openTasks,
          highPriorityOpen,
          overdue: overdue.length
        }
      },
      roles: {
        SUPER_ADMIN: roleCounts.SUPER_ADMIN ?? 0,
        ADMIN: roleCounts.ADMIN ?? 0,
        LEAD: roleCounts.LEAD ?? 0,
        SENIOR_STAFF: roleCounts.SENIOR_STAFF ?? 0,
        JUNIOR_STAFF: roleCounts.JUNIOR_STAFF ?? 0
      },
      staffPreview: staffSample.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        jobTitle: s.jobTitle,
        permissionRole: s.permissionRole
      })),
      overdue,
      recentTasks: recentTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        due: task.due,
        project: task.project.name,
        updatedAt: task.updatedAt.toISOString(),
        owners: task.owners.map((o) => o.staffMember.displayName)
      })),
      recommendations
    };
  },

  async enable(organizationId: string, auth: AuthContext) {
    const existing = await prisma.ttWorkspace.findUnique({ where: { organizationId } });
    if (existing) {
      throw new AppError(409, "TRACKER_ALREADY_ENABLED", "Task tracker is already enabled for this organization");
    }

    const employees = await prisma.employee.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, email: true, status: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    });

    const orgAdmins = await prisma.user.findMany({
      where: {
        memberships: { some: { organizationId } },
        userRoles: { some: { role: { name: { in: [ROLE.ORG_ADMIN, "ADMIN"] } } } },
        status: "ACTIVE"
      },
      select: { id: true, email: true, employee: true }
    });

    const officeAdmins = await prisma.user.findMany({
      where: {
        adminOffices: { some: { office: { organizationId } } },
        userRoles: { some: { role: { name: ROLE.OFFICE_ADMIN } } },
        status: "ACTIVE"
      },
      select: { id: true, email: true, employee: true }
    });

    const usedNames = new Set<string>();
    const staffByUserId = new Map<
      string,
      {
        userId: string;
        employeeId: string | null;
        firstName: string;
        lastName: string;
        jobTitle: string;
        displayName: string;
        permissionRole: TtPermissionRoleDb;
      }
    >();

    for (const employee of employees) {
      if (employee.user.status !== "ACTIVE") continue;
      const base = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() || employee.user.email;
      const displayName = await uniqueDisplayName(usedNames, base, employee.user.email);
      staffByUserId.set(employee.userId, {
        userId: employee.userId,
        employeeId: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        jobTitle: employee.jobTitle ?? "",
        displayName,
        permissionRole: "JUNIOR_STAFF"
      });
    }

    for (const admin of officeAdmins) {
      const existingStaff = staffByUserId.get(admin.id);
      if (existingStaff) {
        existingStaff.permissionRole = "LEAD";
        continue;
      }
      const firstName = admin.employee?.firstName ?? admin.email.split("@")[0] ?? "Admin";
      const lastName = admin.employee?.lastName ?? "";
      const base = [firstName, lastName].filter(Boolean).join(" ").trim() || admin.email;
      const displayName = await uniqueDisplayName(usedNames, base, admin.email);
      staffByUserId.set(admin.id, {
        userId: admin.id,
        employeeId: admin.employee?.id ?? null,
        firstName,
        lastName,
        jobTitle: admin.employee?.jobTitle ?? "",
        displayName,
        permissionRole: "LEAD"
      });
    }

    for (const admin of orgAdmins) {
      const existingStaff = staffByUserId.get(admin.id);
      if (existingStaff) {
        existingStaff.permissionRole = admin.id === auth.userId ? "SUPER_ADMIN" : "ADMIN";
        continue;
      }
      const firstName = admin.employee?.firstName ?? admin.email.split("@")[0] ?? "Admin";
      const lastName = admin.employee?.lastName ?? "";
      const base = [firstName, lastName].filter(Boolean).join(" ").trim() || admin.email;
      const displayName = await uniqueDisplayName(usedNames, base, admin.email);
      staffByUserId.set(admin.id, {
        userId: admin.id,
        employeeId: admin.employee?.id ?? null,
        firstName,
        lastName,
        jobTitle: admin.employee?.jobTitle ?? "",
        displayName,
        permissionRole: admin.id === auth.userId ? "SUPER_ADMIN" : "ADMIN"
      });
    }

    // Ensure the enabling admin is always present as SUPER_ADMIN
    if (!staffByUserId.has(auth.userId)) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: auth.userId },
        include: { employee: true }
      });
      const firstName = user.employee?.firstName ?? user.email.split("@")[0] ?? "Admin";
      const lastName = user.employee?.lastName ?? "";
      const base = [firstName, lastName].filter(Boolean).join(" ").trim() || user.email;
      const displayName = await uniqueDisplayName(usedNames, base, user.email);
      staffByUserId.set(auth.userId, {
        userId: auth.userId,
        employeeId: user.employee?.id ?? null,
        firstName,
        lastName,
        jobTitle: user.employee?.jobTitle ?? "",
        displayName,
        permissionRole: "SUPER_ADMIN"
      });
    } else {
      staffByUserId.get(auth.userId)!.permissionRole = "SUPER_ADMIN";
    }

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.ttWorkspace.create({
        data: {
          organizationId,
          name: "Task Operations"
        }
      });

      const permissionRows = seedPermissionRows(created.id);
      if (permissionRows.length) {
        await tx.ttPermissionRule.createMany({ data: permissionRows });
      }

      let sortOrder = 0;
      for (const member of staffByUserId.values()) {
        await tx.ttStaffMember.create({
          data: {
            workspaceId: created.id,
            userId: member.userId,
            employeeId: member.employeeId,
            displayName: member.displayName,
            firstName: member.firstName,
            lastName: member.lastName,
            jobTitle: member.jobTitle,
            permissionRole: member.permissionRole,
            sortOrder
          }
        });
        sortOrder += 1;
      }

      return created;
    });

    const membership = await ensureMembership({
      workspaceId: workspace.id,
      auth,
      enabler: true
    });

    return {
      enabled: true as const,
      workspaceId: workspace.id,
      name: workspace.name,
      enabledAt: workspace.enabledAt.toISOString(),
      revision: workspace.revision,
      staffCount: staffByUserId.size,
      membership
    };
  }
};
