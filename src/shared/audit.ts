import type { Request } from "express";

export type AuditContext = {
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
};

export function auditContextFromRequest(req: Request): AuditContext {
  if (!req.auth) throw new Error("Authenticated request required for audit context");
  return {
    actorUserId: req.auth.userId,
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? undefined
  };
}

export function auditJson(value: unknown): object | null {
  if (value === undefined || value === null) return null;
  return JSON.parse(JSON.stringify(value)) as object;
}
