import { prisma } from "../../database/prisma.js";

export async function getWorkspaceByOrganizationId(organizationId: string) {
  return prisma.ttWorkspace.findUnique({
    where: { organizationId }
  });
}

export async function requireWorkspaceByOrganizationId(organizationId: string) {
  const workspace = await getWorkspaceByOrganizationId(organizationId);
  if (!workspace) {
    const { AppError } = await import("../../shared/errors/app-error.js");
    throw new AppError(404, "TRACKER_NOT_ENABLED", "Task tracker is not enabled for this organization");
  }
  return workspace;
}

export async function getStaffIdByDisplayName(workspaceId: string, displayName: string): Promise<string | null> {
  const member = await prisma.ttStaffMember.findUnique({
    where: {
      workspaceId_displayName: { workspaceId, displayName }
    },
    select: { id: true }
  });
  return member?.id ?? null;
}

export async function getProjectIdByName(workspaceId: string, name: string): Promise<string | null> {
  const project = await prisma.ttProject.findUnique({
    where: {
      workspaceId_name: { workspaceId, name }
    },
    select: { id: true }
  });
  return project?.id ?? null;
}

export async function buildStaffDisplayNameMap(workspaceId: string) {
  const members = await prisma.ttStaffMember.findMany({
    where: { workspaceId },
    select: { id: true, displayName: true }
  });
  const idToName = new Map(members.map((m) => [m.id, m.displayName]));
  const nameToId = new Map(members.map((m) => [m.displayName, m.id]));
  return { idToName, nameToId };
}
