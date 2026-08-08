import "dotenv/config";
import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./database/prisma.js";
import { initializeSocket } from "./realtime/socket.server.js";
const server=createServer(app);
initializeSocket(server);
server.listen(env.PORT,()=>logger.info({port:env.PORT},"API started"));
async function shutdown(signal:string){ logger.info({signal},"Shutting down"); server.close(async()=>{ await prisma.$disconnect(); process.exit(0); }); }
process.on("SIGTERM",()=>void shutdown("SIGTERM"));
process.on("SIGINT",()=>void shutdown("SIGINT"));
