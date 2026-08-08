import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";

let io: Server | undefined;

export function initializeSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.CORS_ORIGINS.split(","), credentials: true },
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
    const auth = socket.data.auth as { userId: string; roles: string[] };
    socket.join(`user:${auth.userId}`);
    for (const role of auth.roles) socket.join(`role:${role}`);
    logger.debug({ socketId: socket.id, userId: auth.userId }, "Socket connected");
  });
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToRole(role: string, event: string, data: unknown) {
  io?.to(`role:${role}`).emit(event, data);
}
