import { z } from "zod";

const emptyToUndefined = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().optional());

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
  FIREBASE_PROJECT_ID: emptyToUndefined,
  FIREBASE_CLIENT_EMAIL: emptyToUndefined,
  FIREBASE_PRIVATE_KEY: emptyToUndefined,
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("workforce/attendance"),
  ATTENDANCE_PHOTO_REQUIRED: z.coerce.boolean().default(true),
  SMTP_HOST: emptyToUndefined,
  SMTP_PORT: z.preprocess((value) => (value === "" || value === undefined ? 587 : value), z.coerce.number().int().positive().default(587)),
  SMTP_USER: emptyToUndefined,
  SMTP_PASS: emptyToUndefined,
  SMTP_FROM: z.string().default("Workforce <noreply@localhost>"),
  ADMIN_PORTAL_URL: z.string().default("http://localhost:3000"),
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72)
});

export const env = schema.parse(process.env);
