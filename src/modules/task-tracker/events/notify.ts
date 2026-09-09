import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { prisma } from "../../../database/prisma.js";
import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import {
  fanOut,
  NOTIFY_CHANNEL,
  type WorkspaceEventPayload
} from "../events.types.js";

let listenClient: Client | null = null;
let listenReady: Promise<void> | null = null;

export async function bumpWorkspaceRevision(workspaceId: string): Promise<number> {
  const updated = await prisma.ttWorkspace.update({
    where: { id: workspaceId },
    data: { revision: { increment: 1 } },
    select: { revision: true }
  });
  return updated.revision;
}

export async function publishWorkspaceEvent(
  input: Omit<WorkspaceEventPayload, "revision"> & { revision?: number }
): Promise<WorkspaceEventPayload> {
  const revision = input.revision ?? (await bumpWorkspaceRevision(input.workspaceId));

  const event: WorkspaceEventPayload = {
    ...input,
    revision
  };

  await prisma.ttWorkspaceEvent.create({
    data: {
      id: randomUUID(),
      workspaceId: event.workspaceId,
      revision: event.revision,
      type: event.type,
      resource: event.resource,
      resourceId: event.resourceId,
      payload: event.payload as object,
      actorUserId: event.actorUserId,
      actorClientId: event.actorClientId
    }
  });

  try {
    await prisma.$executeRaw`SELECT pg_notify(${NOTIFY_CHANNEL}, ${JSON.stringify(event)})`;
  } catch (error) {
    logger.warn({ err: error }, "tt workspace pg_notify failed");
  }

  fanOut(event);
  return event;
}

async function ensureListenClient(): Promise<Client> {
  if (listenClient && listenReady) {
    await listenReady;
    return listenClient;
  }

  listenClient = new Client({ connectionString: env.DATABASE_URL });
  listenReady = listenClient
    .connect()
    .then(async () => {
      await listenClient!.query(`LISTEN ${NOTIFY_CHANNEL}`);
      listenClient!.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as WorkspaceEventPayload;
          fanOut(event);
        } catch {
          // ignore malformed payloads
        }
      });
    })
    .catch((error) => {
      listenClient = null;
      listenReady = null;
      throw error;
    });

  await listenReady;
  return listenClient;
}

export async function startWorkspaceListener(): Promise<void> {
  try {
    await ensureListenClient();
  } catch (error) {
    logger.warn({ err: error }, "tt workspace LISTEN unavailable; using in-process fan-out only");
  }
}

export async function getWorkspaceRevision(workspaceId: string): Promise<number> {
  const row = await prisma.ttWorkspace.findUnique({
    where: { id: workspaceId },
    select: { revision: true }
  });
  return row?.revision ?? 0;
}

export async function getEventsAfterRevision(
  workspaceId: string,
  afterRevision: number,
  limit = 100
): Promise<WorkspaceEventPayload[]> {
  const rows = await prisma.ttWorkspaceEvent.findMany({
    where: { workspaceId, revision: { gt: afterRevision } },
    orderBy: { revision: "asc" },
    take: limit
  });

  return rows.map((row) => ({
    type: row.type as WorkspaceEventPayload["type"],
    workspaceId: row.workspaceId,
    revision: row.revision,
    actorUserId: row.actorUserId,
    actorClientId: row.actorClientId,
    resource: row.resource,
    resourceId: row.resourceId,
    payload: row.payload
  }));
}
