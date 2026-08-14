import type { CorsOptions } from "cors";
import { env } from "./env.js";

export function buildCorsOptions(): CorsOptions {
  const wildcard = env.CORS_ORIGINS.trim() === "*";
  const allowed = env.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      // Server-to-server / curl — no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (wildcard || allowed.includes(origin)) {
        callback(null, origin);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  };
}
