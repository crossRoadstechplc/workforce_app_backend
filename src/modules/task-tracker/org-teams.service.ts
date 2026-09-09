import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { publishWorkspaceEvent } from "./events/notify.js";
import type { ActorContext } from "./types.js";

export async function createOrgTeam(input: {
  actor: ActorContext;
  name: string;
}): Promise<{ id: string; name: string; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const maxSort = await prisma.ttOrgTeam.aggregate({
    where: { workspaceId },
    _max: { sortOrder: true }
  });

  const orgTeam = await prisma.ttOrgTeam.create({
    data: {
      workspaceId,
      name: input.name.trim(),
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1
    }
  });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.created",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: orgTeam.id,
    payload: { id: orgTeam.id, name: orgTeam.name }
  });

  return { id: orgTeam.id, name: orgTeam.name, revision: published.revision };
}

export async function updateOrgTeam(input: {
  actor: ActorContext;
  orgTeamId: string;
  name: string;
}): Promise<{ id: string; revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttOrgTeam.findFirst({
    where: { id: input.orgTeamId, workspaceId }
  });
  if (!existing) throw new AppError(404, "ORG_TEAM_NOT_FOUND", "Team not found.");

  const orgTeam = await prisma.ttOrgTeam.update({
    where: { id: input.orgTeamId },
    data: { name: input.name.trim() }
  });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: orgTeam.id,
    payload: { id: orgTeam.id, name: orgTeam.name }
  });

  return { id: orgTeam.id, revision: published.revision };
}

export async function deleteOrgTeam(input: {
  actor: ActorContext;
  orgTeamId: string;
}): Promise<{ revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttOrgTeam.findFirst({
    where: { id: input.orgTeamId, workspaceId }
  });
  if (!existing) throw new AppError(404, "ORG_TEAM_NOT_FOUND", "Team not found.");

  await prisma.ttOrgTeamMember.deleteMany({ where: { orgTeamId: input.orgTeamId } });
  await prisma.ttOrgTeam.delete({ where: { id: input.orgTeamId } });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.deleted",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: input.orgTeamId,
    payload: { id: input.orgTeamId }
  });

  return { revision: published.revision };
}

export async function setOrgTeamMembers(input: {
  actor: ActorContext;
  orgTeamId: string;
  memberIds: string[];
}): Promise<{ revision: number }> {
  const workspaceId = input.actor.workspaceId;
  const existing = await prisma.ttOrgTeam.findFirst({
    where: { id: input.orgTeamId, workspaceId }
  });
  if (!existing) throw new AppError(404, "ORG_TEAM_NOT_FOUND", "Team not found.");

  const memberIds = [...new Set(input.memberIds)];

  await prisma.$transaction(async (tx) => {
    await tx.ttOrgTeamMember.deleteMany({ where: { orgTeamId: input.orgTeamId } });
    if (memberIds.length > 0) {
      await tx.ttOrgTeamMember.createMany({
        data: memberIds.map((staffMemberId) => ({
          orgTeamId: input.orgTeamId,
          staffMemberId
        }))
      });
    }
  });

  const published = await publishWorkspaceEvent({
    type: "orgTeam.updated",
    workspaceId,
    actorUserId: input.actor.userId,
    actorClientId: input.actor.clientId ?? null,
    resource: "orgTeam",
    resourceId: input.orgTeamId,
    payload: { id: input.orgTeamId, memberIds }
  });

  return { revision: published.revision };
}
