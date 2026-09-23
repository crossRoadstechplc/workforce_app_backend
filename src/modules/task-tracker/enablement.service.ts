import { prisma } from "../../database/prisma.js";
import type { AuthContext } from "../../shared/tenancy.js";
import { ensureMembership } from "./membership.service.js";
import { syncWorkforceStaffToWorkspace } from "./staff-sync.service.js";
import { ensureTtWorkspace } from "./workspace-bootstrap.js";

export const enablementService = {
  async status(organizationId: string) {
    const workspace = await ensureTtWorkspace(organizationId);
    const staffCount = await prisma.ttStaffMember.count({ where: { workspaceId: workspace.id } });
    return {
      enabled: true as const,
      workspaceId: workspace.id,
      name: workspace.name,
      enabledAt: workspace.enabledAt.toISOString(),
      revision: workspace.revision,
      staffCount
    };
  },

  async summary(organizationId: string) {
    const workspace = await ensureTtWorkspace(organizationId);

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

  /** Idempotent: Task Ops is always on; seeds workspace on first call. */
  async enable(organizationId: string, auth: AuthContext) {
    const workspace = await ensureTtWorkspace(organizationId);

    const synced = await syncWorkforceStaffToWorkspace({
      workspaceId: workspace.id,
      organizationId,
      forceSuperAdminUserId: auth.userId
    });

    const membership = await ensureMembership({
      workspaceId: workspace.id,
      auth,
      enabler: true
    });

    const staffCount = await prisma.ttStaffMember.count({ where: { workspaceId: workspace.id } });

    return {
      enabled: true as const,
      workspaceId: workspace.id,
      name: workspace.name,
      enabledAt: workspace.enabledAt.toISOString(),
      revision: workspace.revision,
      staffCount,
      synced,
      membership
    };
  }
};
