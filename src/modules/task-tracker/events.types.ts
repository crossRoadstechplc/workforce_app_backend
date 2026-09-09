export type WorkspaceEventType =
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "task.deleted"
  | "task.archived"
  | "task.restored"
  | "task.update.added"
  | "schedule.created"
  | "schedule.updated"
  | "schedule.deleted"
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "orgTeam.created"
  | "orgTeam.updated"
  | "orgTeam.deleted"
  | "staff.updated"
  | "staff.role.updated"
  | "staff.deleted"
  | "permissions.updated"
  | "notification.created"
  | "workspace.reload";

export type WorkspaceEventPayload = {
  type: WorkspaceEventType;
  workspaceId: string;
  revision: number;
  actorUserId: string | null;
  actorClientId: string | null;
  resource: string;
  resourceId: string | null;
  payload: unknown;
};

export const NOTIFY_CHANNEL = "tt_workspace_events";

export type SseSubscriber = {
  workspaceId: string;
  afterRevision: number;
  enqueue: (event: WorkspaceEventPayload) => void;
  close: () => void;
};

const subscribers = new Set<SseSubscriber>();

export function subscribe(subscriber: SseSubscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function fanOut(event: WorkspaceEventPayload): void {
  for (const subscriber of subscribers) {
    if (subscriber.workspaceId !== event.workspaceId) continue;
    if (event.revision <= subscriber.afterRevision) continue;
    subscriber.enqueue(event);
  }
}
