import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { logger } from "../config/logger.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";
import { ROLE } from "../shared/tenancy.js";

let io: Server | undefined;

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

  io.on("connection", (socket) => {
    const auth = socket.data.auth as { userId: string; roles: string[]; organizationId: string | null };
    socket.join(`user:${auth.userId}`);
    for (const role of auth.roles) {
      if (role === ROLE.SUPER_ADMIN) {
        socket.join(`role:${ROLE.SUPER_ADMIN}`);
      } else if (auth.organizationId) {
        socket.join(`org:${auth.organizationId}:role:${role}`);
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
