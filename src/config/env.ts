import { z } from "zod";

const emptyToUndefined = z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().optional());

function normalizeAdminPortalUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const host = trimmed.replace(/^\/+/, "");
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  return `${isLocal ? "http" : "https"}://${host}`;
}

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
  DISPLAY_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
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
  RESEND_API_KEY: emptyToUndefined,
  ADMIN_PORTAL_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? normalizeAdminPortalUrl(value) : value),
    z.string().url().default("http://localhost:3000")
  ),
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  VAULT_CREDENTIALS_PIN: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(4).default("VaultCreds123")),
  VAULT_SUBSCRIPTION_PIN: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(4).default("VaultSubs123")),
  VAULT_REVEAL_PIN: z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().min(4).default("VaultReveal123")),
  VAULT_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "VAULT_ENCRYPTION_KEY must be 64 hex characters").default(
    "a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00"
  ),
  VAULT_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15)
});

export const env = schema.parse(process.env);
