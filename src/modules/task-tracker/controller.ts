import type { RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { applyPermittedWorkspaceUpdate } from "./permissions.js";
import { canSeeAllProjects } from "./visibility.js";
import { getLegacyWorkspaceData } from "./mapper.js";
import { enablementService } from "./enablement.service.js";
import {
  getEventsAfterRevision,
  getWorkspaceRevision,
  publishWorkspaceEvent,
  startWorkspaceListener
} from "./events/notify.js";
import { subscribe, type WorkspaceEventPayload } from "./events.types.js";
import { actorFromRequest, setRevisionHeaders } from "./middleware.js";
import {
  listNotificationsForRecipient,
  markAllNotificationsRead,
  markNotificationRead
} from "./notifications.service.js";
import { createOrgTeam, deleteOrgTeam, setOrgTeamMembers, updateOrgTeam } from "./org-teams.service.js";
import { createProject, deleteProject, setProjectMembers, updateProject } from "./projects.service.js";
import { createScheduleEvent, deleteScheduleEvent, updateScheduleEvent } from "./schedule.service.js";
import { sessionExchangeService } from "./session-exchange.service.js";
import {
  createStaffFromUser,
  deleteStaffMember,
  updatePermissions,
  updateStaffMember,
  updateStaffRole
} from "./staff.service.js";
import { syncLegacyWorkspaceData } from "./sync.js";
import {
  addTaskUpdate,
  archiveTask,
  createTask,
  deleteTask,
  moveTask,
  restoreTrashTask,
  updateTask
} from "./tasks.service.js";
import type { WorkspaceData } from "./types.js";
import { toPermissionRoleLabel } from "./roles.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

const HEARTBEAT_MS = 15_000;

function formatSse(event: WorkspaceEventPayload): string {
  return `id: ${event.revision}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const getMe: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const member = await (await import("../../database/prisma.js")).prisma.ttStaffMember.findUniqueOrThrow({
      where: { id: actor.staffMemberId },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        permissionRole: true
      }
    });
    const data = await getLegacyWorkspaceData(actor.workspaceId, {
      staffMemberId: actor.staffMemberId,
      permissionRole: actor.permissionRole
    });
    res.json({
      staffMember: {
        id: member.id,
        displayName: member.displayName,
        firstName: member.firstName,
        lastName: member.lastName,
        jobTitle: member.jobTitle,
        permissionRole: actor.permissionRole
      },
      permissionRole: actor.permissionRole,
      permissionMatrix: data.permissionMatrix,
      workspaceId: actor.workspaceId
    });
  } catch (e) {
    next(e);
  }
};

export const createSessionExchange: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
    const contextKey = req.auth.activeContext?.key ?? `org:${requireOrganizationId(req.auth)}`;
    res.json(await sessionExchangeService.create({ userId: req.auth.userId, contextKey }));
  } catch (e) {
    next(e);
  }
};

/** Public: exchange one-time handoff token for workforce access/refresh tokens. */
export const consumeSessionExchange: RequestHandler = async (req, res, next) => {
  try {
    const exchangeToken =
      typeof req.body?.exchangeToken === "string" ? req.body.exchangeToken.trim() : "";
    if (!exchangeToken) {
      throw new AppError(400, "VALIDATION_ERROR", "exchangeToken is required");
    }
    const exchanged = await sessionExchangeService.consume(exchangeToken);
    const { authService } = await import("../auth/auth.service.js");
    const session = await authService.switchContext(exchanged.userId, exchanged.contextKey, {
      deviceId: "task-tracker-web"
    });
    res.json(session);
  } catch (e) {
    next(e);
  }
};

export const getWorkspace: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const data = await getLegacyWorkspaceData(actor.workspaceId, {
      staffMemberId: actor.staffMemberId,
      permissionRole: actor.permissionRole
    });
    const revision = await getWorkspaceRevision(actor.workspaceId);
    res.setHeader("Cache-Control", "no-store");
    setRevisionHeaders(res, revision);
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const putWorkspace: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    if (!canSeeAllProjects(actor.permissionRole)) {
      throw new AppError(403, "FORBIDDEN", "Forbidden.");
    }
    const existing = await getLegacyWorkspaceData(actor.workspaceId);
    const incoming = req.body as WorkspaceData;
    const merged = applyPermittedWorkspaceUpdate({
      existing,
      incoming,
      role: actor.permissionRole,
      actorDisplayName: actor.displayName
    });
    await syncLegacyWorkspaceData(actor.workspaceId, merged);
    const published = await publishWorkspaceEvent({
      type: "workspace.reload",
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      actorClientId: actor.clientId ?? null,
      resource: "workspace",
      resourceId: actor.workspaceId,
      payload: { ok: true }
    });
    setRevisionHeaders(res, published.revision);
    res.json({ ok: true, revision: published.revision });
  } catch (e) {
    next(e);
  }
};

export const importWorkspace: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const body = req.body as { app?: string; data?: WorkspaceData } & WorkspaceData;
    const incoming = (body.data ?? body) as WorkspaceData;
    const existing = await getLegacyWorkspaceData(actor.workspaceId);
    const merged = applyPermittedWorkspaceUpdate({
      existing,
      incoming,
      role: actor.permissionRole,
      actorDisplayName: actor.displayName
    });
    await syncLegacyWorkspaceData(actor.workspaceId, merged);
    const published = await publishWorkspaceEvent({
      type: "workspace.reload",
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      actorClientId: actor.clientId ?? null,
      resource: "workspace",
      resourceId: actor.workspaceId,
      payload: { ok: true }
    });
    setRevisionHeaders(res, published.revision);
    res.json({ ok: true, revision: published.revision });
  } catch (e) {
    next(e);
  }
};

export const putPermissions: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const result = await updatePermissions({
      actor,
      matrix: req.body.permissionMatrix
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const postTask: RequestHandler = async (req, res, next) => {
  try {
    const result = await createTask({ actor: actorFromRequest(req), ...req.body });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const patchTask: RequestHandler = async (req, res, next) => {
  try {
    const result = await updateTask({
      actor: actorFromRequest(req),
      taskId: paramId(req.params.id!),
      ...req.body
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const removeTask: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteTask({ actor: actorFromRequest(req), taskId: paramId(req.params.id!) });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const postTaskUpdate: RequestHandler = async (req, res, next) => {
  try {
    const result = await addTaskUpdate({
      actor: actorFromRequest(req),
      taskId: paramId(req.params.id!),
      text: req.body.text
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const postMoveTask: RequestHandler = async (req, res, next) => {
  try {
    const result = await moveTask({
      actor: actorFromRequest(req),
      taskId: paramId(req.params.id!),
      status: req.body.status,
      sortOrder: req.body.sortOrder
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const postArchiveTask: RequestHandler = async (req, res, next) => {
  try {
    const result = await archiveTask({ actor: actorFromRequest(req), taskId: paramId(req.params.id!) });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const postRestoreTrash: RequestHandler = async (req, res, next) => {
  try {
    const result = await restoreTrashTask({
      actor: actorFromRequest(req),
      trashId: paramId(req.params.trashId!)
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const postProject: RequestHandler = async (req, res, next) => {
  try {
    const result = await createProject({ actor: actorFromRequest(req), name: req.body.name });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const patchProject: RequestHandler = async (req, res, next) => {
  try {
    const result = await updateProject({
      actor: actorFromRequest(req),
      projectId: paramId(req.params.id!),
      ...req.body
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const removeProject: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteProject({
      actor: actorFromRequest(req),
      projectId: paramId(req.params.id!)
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const putProjectMembers: RequestHandler = async (req, res, next) => {
  try {
    const result = await setProjectMembers({
      actor: actorFromRequest(req),
      projectId: paramId(req.params.id!),
      memberIds: req.body.memberIds
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const postOrgTeam: RequestHandler = async (req, res, next) => {
  try {
    const result = await createOrgTeam({ actor: actorFromRequest(req), name: req.body.name });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const patchOrgTeam: RequestHandler = async (req, res, next) => {
  try {
    const result = await updateOrgTeam({
      actor: actorFromRequest(req),
      orgTeamId: paramId(req.params.id!),
      name: req.body.name
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const removeOrgTeam: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteOrgTeam({
      actor: actorFromRequest(req),
      orgTeamId: paramId(req.params.id!)
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const putOrgTeamMembers: RequestHandler = async (req, res, next) => {
  try {
    const result = await setOrgTeamMembers({
      actor: actorFromRequest(req),
      orgTeamId: paramId(req.params.id!),
      memberIds: req.body.memberIds
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const postSchedule: RequestHandler = async (req, res, next) => {
  try {
    const result = await createScheduleEvent({ actor: actorFromRequest(req), event: req.body });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const patchSchedule: RequestHandler = async (req, res, next) => {
  try {
    const result = await updateScheduleEvent({
      actor: actorFromRequest(req),
      eventId: paramId(req.params.id!),
      patch: req.body
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const removeSchedule: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteScheduleEvent({
      actor: actorFromRequest(req),
      eventId: paramId(req.params.id!)
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const inviteStaff: RequestHandler = async (req, res, next) => {
  try {
    const result = await createStaffFromUser({ actor: actorFromRequest(req), ...req.body });
    if (result.revision) setRevisionHeaders(res, result.revision);
    const { revision: _r, ...body } = result;
    res.json(body);
  } catch (e) {
    next(e);
  }
};

export const patchStaff: RequestHandler = async (req, res, next) => {
  try {
    const result = await updateStaffMember({
      actor: actorFromRequest(req),
      staffId: paramId(req.params.id!),
      ...req.body
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const removeStaff: RequestHandler = async (req, res, next) => {
  try {
    const result = await deleteStaffMember({
      actor: actorFromRequest(req),
      staffId: paramId(req.params.id!)
    });
    setRevisionHeaders(res, result.revision);
    res.json({ ok: true, revision: result.revision });
  } catch (e) {
    next(e);
  }
};

export const patchStaffRole: RequestHandler = async (req, res, next) => {
  try {
    const result = await updateStaffRole({
      actor: actorFromRequest(req),
      staffId: paramId(req.params.id!),
      permissionRole: toPermissionRoleLabel(req.body.permissionRole)
    });
    setRevisionHeaders(res, result.revision);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const getNotifications: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    res.json(await listNotificationsForRecipient(actor.staffMemberId));
  } catch (e) {
    next(e);
  }
};

export const patchNotificationRead: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const notification = await markNotificationRead(paramId(req.params.id!), actor.staffMemberId);
    if (!notification) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    res.json({ notification });
  } catch (e) {
    next(e);
  }
};

export const patchNotificationsReadAll: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const updated = await markAllNotificationsRead(actor.staffMemberId);
    res.json({ ok: true, updated });
  } catch (e) {
    next(e);
  }
};

export const getEvents: RequestHandler = async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    const afterParam = req.query.after;
    const afterRevision = afterParam !== undefined ? Number(afterParam) : 0;

    await startWorkspaceListener();

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let closed = false;
    const enqueue = (chunk: string) => {
      if (closed) return;
      res.write(chunk);
    };

    const currentRevision = await getWorkspaceRevision(actor.workspaceId);
    enqueue(`: connected revision=${currentRevision}\n\n`);

    const missed = await getEventsAfterRevision(
      actor.workspaceId,
      Number.isFinite(afterRevision) ? afterRevision : 0
    );
    for (const event of missed) enqueue(formatSse(event));

    const unsubscribe = subscribe({
      workspaceId: actor.workspaceId,
      afterRevision: Number.isFinite(afterRevision) ? afterRevision : 0,
      enqueue: (event) => enqueue(formatSse(event)),
      close: () => {
        if (!closed) res.end();
      }
    });

    const heartbeat = setInterval(() => {
      enqueue(`: heartbeat ${Date.now()}\n\n`);
    }, HEARTBEAT_MS);

    const cleanup = () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  } catch (e) {
    next(e);
  }
};

export const adminStatus: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = requireOrganizationId(req.auth);
    res.json(await enablementService.status(organizationId));
  } catch (e) {
    next(e);
  }
};

export const adminSummary: RequestHandler = async (req, res, next) => {
  try {
    const organizationId = requireOrganizationId(req.auth);
    res.json(await enablementService.summary(organizationId));
  } catch (e) {
    next(e);
  }
};

export const adminEnable: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
    const organizationId = requireOrganizationId(req.auth);
    res.status(201).json(await enablementService.enable(organizationId, req.auth));
  } catch (e) {
    next(e);
  }
};
