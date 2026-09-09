import { randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  PERMISSION_ROLE_TO_DB,
  TASK_STATUS_TO_DB,
  toPermissionRoleLabel,
  toTaskStatusLabel
} from "./roles.js";
import type { WorkspaceData } from "./types.js";

function normalizeOwners(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))
    ];
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/** Full workspace replace used by PUT /workspace and import. Staff rows keep userId links when display names match. */
export async function syncLegacyWorkspaceData(workspaceId: string, data: WorkspaceData): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const existingStaffLinks = await tx.ttStaffMember.findMany({
        where: { workspaceId },
        select: { id: true, displayName: true, userId: true, employeeId: true }
      });
      const staffLinkByDisplayName = new Map(existingStaffLinks.map((member) => [member.displayName, member]));

      await tx.ttPermissionRule.deleteMany({ where: { workspaceId } });
      await tx.ttScheduleEventGuest.deleteMany({ where: { event: { workspaceId } } });
      await tx.ttScheduleEvent.deleteMany({ where: { workspaceId } });
      await tx.ttTaskUpdate.deleteMany({ where: { task: { workspaceId } } });
      await tx.ttTaskOwner.deleteMany({ where: { task: { workspaceId } } });
      await tx.ttTask.deleteMany({ where: { workspaceId } });
      await tx.ttDeletedTask.deleteMany({ where: { workspaceId } });
      await tx.ttArchivedTask.deleteMany({ where: { workspaceId } });
      await tx.ttProjectMember.deleteMany({ where: { project: { workspaceId } } });
      await tx.ttOrgTeamMember.deleteMany({ where: { orgTeam: { workspaceId } } });
      await tx.ttProject.deleteMany({ where: { workspaceId } });
      await tx.ttOrgTeam.deleteMany({ where: { workspaceId } });
      await tx.ttStaffMember.deleteMany({ where: { workspaceId } });

      const staffIdByName = new Map<string, string>();

      for (let index = 0; index < data.staff.length; index += 1) {
        const displayName = data.staff[index]!;
        const profile = data.staffProfiles[displayName] ?? {
          firstName: displayName.split(/\s+/)[0] ?? displayName,
          lastName: displayName.split(/\s+/).slice(1).join(" "),
          role: "",
          permissionRole: "Junior Staff" as const
        };

        const existing = staffLinkByDisplayName.get(displayName);
        if (!existing?.userId) {
          throw new AppError(
            400,
            "STAFF_USER_REQUIRED",
            `Cannot sync staff "${displayName}" without an existing user link. Re-enable tracker or add staff via email.`
          );
        }

        const member = await tx.ttStaffMember.create({
          data: {
            ...(existing ? { id: existing.id } : {}),
            workspaceId,
            userId: existing.userId,
            employeeId: existing.employeeId,
            displayName,
            firstName: profile.firstName ?? "",
            lastName: profile.lastName ?? "",
            jobTitle: profile.role ?? "",
            permissionRole: PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(profile.permissionRole)],
            sortOrder: index
          }
        });

        staffIdByName.set(displayName, member.id);
      }

      const projectIdByName = new Map<string, string>();

      for (let index = 0; index < data.teams.length; index += 1) {
        const name = data.teams[index]!;
        const leaderName = data.teamLeaders[name] ?? "";
        const leaderId = leaderName ? (staffIdByName.get(leaderName) ?? null) : null;

        const project = await tx.ttProject.create({
          data: { workspaceId, name, sortOrder: index, leaderId }
        });
        projectIdByName.set(name, project.id);

        for (const memberName of data.teamMembers[name] ?? []) {
          const staffMemberId = staffIdByName.get(memberName);
          if (!staffMemberId) continue;
          await tx.ttProjectMember.create({ data: { projectId: project.id, staffMemberId } });
        }
      }

      for (let index = 0; index < data.orgTeams.length; index += 1) {
        const name = data.orgTeams[index]!;
        const orgTeam = await tx.ttOrgTeam.create({
          data: { workspaceId, name, sortOrder: index }
        });
        for (const memberName of data.orgTeamMembers[name] ?? []) {
          const staffMemberId = staffIdByName.get(memberName);
          if (!staffMemberId) continue;
          await tx.ttOrgTeamMember.create({ data: { orgTeamId: orgTeam.id, staffMemberId } });
        }
      }

      for (let index = 0; index < data.tasks.length; index += 1) {
        const task = data.tasks[index]!;
        const projectId = projectIdByName.get(task.team);
        if (!projectId) {
          throw new AppError(400, "UNKNOWN_PROJECT", `Task "${task.title}" references unknown project "${task.team}".`);
        }
        const owners = normalizeOwners(task.owners ?? task.owner);
        await tx.ttTask.create({
          data: {
            id: task.id,
            workspaceId,
            projectId,
            title: task.title,
            description: task.description ?? "",
            priority: task.priority === "High" ? "High" : "Low",
            due: task.due ?? "",
            status: TASK_STATUS_TO_DB[toTaskStatusLabel(task.status)],
            sortOrder: index,
            owners: {
              create: owners.map((ownerName, ownerIndex) => {
                const staffMemberId = staffIdByName.get(ownerName);
                if (!staffMemberId) {
                  throw new AppError(400, "UNKNOWN_OWNER", `Task "${task.title}" references unknown owner "${ownerName}".`);
                }
                return { staffMemberId, sortOrder: ownerIndex };
              })
            },
            updates: {
              create: (task.updates ?? []).map((update) => ({
                id: update.id ?? randomUUID(),
                text: update.text,
                createdAt: new Date(update.createdAt)
              }))
            }
          }
        });
      }

      for (const deletedTask of data.deletedTasks) {
        await tx.ttDeletedTask.create({
          data: {
            trashId: deletedTask.trashId ?? randomUUID(),
            workspaceId,
            previousStatus: deletedTask.previousStatus,
            deletedAt: new Date(deletedTask.deletedAt),
            payload: deletedTask as object
          }
        });
      }

      for (const archivedTask of data.archivedTasks) {
        await tx.ttArchivedTask.create({
          data: {
            archivedId: archivedTask.archivedId,
            workspaceId,
            archivedAt: new Date(archivedTask.archivedAt),
            payload: archivedTask as object
          }
        });
      }

      for (const event of data.schedule.events) {
        const projectId = event.project ? (projectIdByName.get(event.project) ?? null) : null;
        await tx.ttScheduleEvent.create({
          data: {
            id: event.id,
            workspaceId,
            projectId,
            title: event.title,
            start: new Date(event.start),
            end: new Date(event.end),
            allDay: Boolean(event.allDay),
            description: event.description ?? "",
            location: event.location ?? "",
            color: event.color,
            guests: {
              create: (event.guests ?? [])
                .map((guestName) => staffIdByName.get(guestName))
                .filter((staffMemberId): staffMemberId is string => Boolean(staffMemberId))
                .map((staffMemberId) => ({ staffMemberId }))
            }
          }
        });
      }

      for (const [roleLabel, actions] of Object.entries(data.permissionMatrix)) {
        const role = PERMISSION_ROLE_TO_DB[toPermissionRoleLabel(roleLabel)];
        for (const [actionId, allowed] of Object.entries(actions)) {
          await tx.ttPermissionRule.create({
            data: { workspaceId, role, actionId, allowed: Boolean(allowed) }
          });
        }
      }
    },
    { timeout: 60_000 }
  );
}
