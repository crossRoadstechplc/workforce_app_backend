import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  JWT_ISSUER: z.string().default("workforce-api"),
  JWT_AUDIENCE: z.string().default("workforce-clients"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  MISSING_CHECKOUT_GRACE_MINUTES: z.coerce.number().int().min(0).default(120),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional()
});

export const env = schema.parse(process.env);
