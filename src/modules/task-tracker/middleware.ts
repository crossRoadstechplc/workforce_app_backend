import type { Request, RequestHandler, Response } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { getLegacyWorkspaceData } from "./mapper.js";
import { resolveTrackerContext } from "./membership.service.js";
import { can, type PermissionActionId } from "./permissions.js";
import type { ActorContext } from "./types.js";

export function actorFromRequest(req: Request): ActorContext {
  const tracker = req.tracker;
  if (!tracker || !req.auth) {
    throw new AppError(403, "TRACKER_MEMBERSHIP_REQUIRED", "Task tracker membership is required");
  }
  return {
    userId: req.auth.userId,
    clientId: typeof req.headers["x-client-id"] === "string" ? req.headers["x-client-id"] : null,
    staffMemberId: tracker.staffMemberId,
    permissionRole: tracker.permissionRole,
    displayName: tracker.displayName,
    workspaceId: tracker.workspaceId
  };
}

export const requireTrackerMembership: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Authentication required");
    requireOrganizationId(req.auth);
    const tracker = await resolveTrackerContext(req.auth);
    req.tracker = tracker;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireTrackerPermission(actionId: PermissionActionId): RequestHandler {
  return async (req, _res, next) => {
    try {
      const actor = actorFromRequest(req);
      const data = await getLegacyWorkspaceData(actor.workspaceId, {
        staffMemberId: actor.staffMemberId,
        permissionRole: actor.permissionRole
      });
      if (!can(actor.permissionRole, actionId, data.permissionMatrix)) {
        throw new AppError(403, "FORBIDDEN", "Forbidden.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function setRevisionHeaders(res: Response, revision: number) {
  res.setHeader("ETag", `"${revision}"`);
  res.setHeader("X-Workspace-Revision", String(revision));
}
