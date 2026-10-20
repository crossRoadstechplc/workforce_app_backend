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
  /**
   * When set, only these staff members (plus Admin/Super Admin subscribers)
   * receive the event. Null/undefined = all workspace subscribers.
   */
  visibleToStaffIds?: string[] | null;
};

export const NOTIFY_CHANNEL = "tt_workspace_events";

export type SseSubscriber = {
  workspaceId: string;
  afterRevision: number;
  staffMemberId?: string;
  canSeeAllTasks?: boolean;
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

function subscriberMayReceive(subscriber: SseSubscriber, event: WorkspaceEventPayload): boolean {
  if (!event.visibleToStaffIds || event.visibleToStaffIds.length === 0) {
    // Empty array means "nobody except admins" for unassigned-with-no-leader edge cases.
    if (Array.isArray(event.visibleToStaffIds) && event.visibleToStaffIds.length === 0) {
      return Boolean(subscriber.canSeeAllTasks);
    }
    return true;
  }
  if (subscriber.canSeeAllTasks) return true;
  if (!subscriber.staffMemberId) return true;
  return event.visibleToStaffIds.includes(subscriber.staffMemberId);
}

export function fanOut(event: WorkspaceEventPayload): void {
  for (const subscriber of subscribers) {
    if (subscriber.workspaceId !== event.workspaceId) continue;
    if (event.revision <= subscriber.afterRevision) continue;
    if (!subscriberMayReceive(subscriber, event)) continue;
    subscriber.enqueue(event);
  }
}
