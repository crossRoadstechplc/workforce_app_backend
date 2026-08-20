import { z } from "zod";
import { VAULT_SCOPES } from "./vault-token.js";

const uuid = z.string().uuid();

const emptyToUndefined = (value: unknown) => (value === "" || value === null || value === undefined ? undefined : value);
const emptyToNull = (value: unknown) => (value === "" ? null : value);

const queryInt = (fallback: number, max = 100) =>
  z.preprocess((value) => (emptyToUndefined(value) === undefined ? fallback : value), z.coerce.number().int().min(1).max(max));

const optionalUuid = z.preprocess(emptyToNull, uuid.nullable().optional());
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const yearMonth = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

const isoDate = z
  .string()
  .trim()
  .transform((value) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : value))
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Use YYYY-MM or YYYY-MM-DD");

const optionalIsoDate = z.preprocess(emptyToNull, isoDate.nullable().optional());

export const unlockSchema = z.object({
  body: z.object({
    pin: z.string().min(1).max(100),
    scope: z.enum(VAULT_SCOPES)
  })
});

export const credentialIdSchema = z.object({
  params: z.object({ id: uuid })
});

export const credentialListSchema = z.object({
  query: z.object({
    page: queryInt(1),
    pageSize: queryInt(50),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    type: z.preprocess(emptyToUndefined, z.enum(["EMAIL", "PASSWORD", "WIFI", "BANK", "SOFTWARE", "API_KEY", "OTHER"]).optional()),
    officeId: z.preprocess(emptyToUndefined, uuid.optional())
  })
});

const credentialBody = z.object({
  title: z.string().trim().min(1).max(150),
  type: z.enum(["EMAIL", "PASSWORD", "WIFI", "BANK", "SOFTWARE", "API_KEY", "OTHER"]),
  officeId: optionalUuid,
  username: optionalText(200),
  email: optionalText(200),
  url: optionalText(500),
  notes: optionalText(2000),
  secret: z.string().min(1).max(2000)
});

export const createCredentialSchema = z.object({ body: credentialBody });
export const updateCredentialSchema = z.object({
  params: z.object({ id: uuid }),
  body: credentialBody
    .partial()
    .extend({ secret: z.string().min(1).max(2000).optional() })
    .refine((value) => Object.keys(value).length > 0, "At least one field is required")
});

export const subscriptionIdSchema = z.object({
  params: z.object({ id: uuid })
});

export const subscriptionListSchema = z.object({
  query: z.object({
    page: queryInt(1),
    pageSize: queryInt(50),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    status: z.preprocess(emptyToUndefined, z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional()),
    officeId: z.preprocess(emptyToUndefined, uuid.optional())
  })
});

const subscriptionBody = z.object({
  name: z.string().trim().min(1).max(150),
  vendor: optionalText(150),
  category: optionalText(80),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).optional().default("MONTHLY"),
  seats: z.coerce.number().int().min(1).max(100000),
  unitAmount: z.coerce.number().min(0).max(1_000_000),
  currency: z.preprocess((value) => {
    const next = emptyToUndefined(value);
    return typeof next === "string" ? next.trim().toUpperCase() : next ?? "ETB";
  }, z.string().min(1).max(8).default("ETB")),
  startDate: isoDate,
  endDate: optionalIsoDate,
  renewalDay: z.preprocess(
    emptyToNull,
    z.union([z.null(), z.coerce.number().int().min(1).max(28)]).optional()
  ),
  notes: optionalText(2000),
  officeId: optionalUuid,
  loginCredentialId: optionalUuid,
  fromYearMonth: z.preprocess(emptyToUndefined, yearMonth.optional())
});

export const createSubscriptionSchema = z.object({ body: subscriptionBody });
export const updateSubscriptionSchema = z.object({
  params: z.object({ id: uuid }),
  body: subscriptionBody.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required")
});

export const upsertPeriodSchema = z.object({
  params: z.object({ id: uuid, yearMonth }),
  body: z.object({
    seats: z.coerce.number().int().min(1).max(100000).optional(),
    amount: z.coerce.number().min(0).max(1_000_000).optional(),
    paid: z.boolean().optional(),
    notes: optionalText(500)
  }).refine((value) => Object.keys(value).length > 0, "At least one field is required")
});
