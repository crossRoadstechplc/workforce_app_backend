import type { Request } from "express";
import type { Prisma } from "../generated/prisma/client.js";

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

export function auditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
