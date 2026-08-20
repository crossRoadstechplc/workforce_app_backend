import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { logger } from "../config/logger.js";
import { prisma } from "../database/prisma.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";
import { ROLE } from "../shared/tenancy.js";

let io: Server | undefined;

const ORG_ADMIN_ROLES = [ROLE.ORG_ADMIN, ROLE.OFFICE_ADMIN, "ADMIN"] as const;

function officeDisplayRoom(organizationId: string, officeId: string) {
  return `org:${organizationId}:office:${officeId}:display`;
}

function officeStaffRoom(organizationId: string, officeId: string) {
  return `org:${organizationId}:office:${officeId}:staff`;
}

export function initializeSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"]
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("AUTH_REQUIRED"));
      const auth = await verifyAccessToken(token);
      if (auth.restricted) return next(new Error("PASSWORD_CHANGE_REQUIRED"));
      socket.data.auth = auth;
      next();
    } catch {
      next(new Error("INVALID_ACCESS_TOKEN"));
    }
  });

  io.on("connection", async (socket) => {
    const auth = socket.data.auth as {
      userId: string;
      roles: string[];
      organizationId: string | null;
      officeIds?: string[];
      typ?: "access" | "display";
    };
    if (auth.typ === "display") {
      const officeId = auth.officeIds?.[0];
      if (auth.organizationId && officeId) {
        socket.join(officeDisplayRoom(auth.organizationId, officeId));
      }
      logger.debug({ socketId: socket.id, displayId: auth.userId, organizationId: auth.organizationId }, "Display socket connected");
      return;
    }
    socket.join(`user:${auth.userId}`);
    for (const role of auth.roles) {
      if (role === ROLE.SUPER_ADMIN) {
        socket.join(`role:${ROLE.SUPER_ADMIN}`);
      } else if (auth.organizationId) {
        socket.join(`org:${auth.organizationId}:role:${role}`);
      }
    }
    if (auth.organizationId) {
      const officeIds = new Set(auth.officeIds ?? []);
      if (officeIds.size === 0) {
        const employee = await prisma.employee.findUnique({
          where: { userId: auth.userId },
          select: { officeId: true }
        });
        if (employee?.officeId) officeIds.add(employee.officeId);
      }
      for (const officeId of officeIds) {
        socket.join(officeStaffRoom(auth.organizationId, officeId));
      }
    }
    logger.debug({ socketId: socket.id, userId: auth.userId, organizationId: auth.organizationId }, "Socket connected");
  });
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}

/** @deprecated Prefer emitToOrgRole for tenant isolation */
export function emitToRole(role: string, event: string, data: unknown) {
  io?.to(`role:${role}`).emit(event, data);
}

export function emitToOrgRole(organizationId: string, role: string, event: string, data: unknown) {
  io?.to(`org:${organizationId}:role:${role}`).emit(event, data);
}

export function emitToOrgAdmins(organizationId: string, event: string, data: unknown) {
  for (const role of ORG_ADMIN_ROLES) {
    emitToOrgRole(organizationId, role, event, data);
  }
}

export function emitToOfficeStaff(organizationId: string, officeId: string | null | undefined, event: string, data: unknown = {}) {
  if (!officeId) return;
  io?.to(officeStaffRoom(organizationId, officeId)).emit(event, data);
}

export function emitToOfficeDisplay(organizationId: string, officeId: string | null | undefined, event: string, data: unknown = {}) {
  if (!officeId) return;
  io?.to(officeDisplayRoom(organizationId, officeId)).emit(event, data);
}
