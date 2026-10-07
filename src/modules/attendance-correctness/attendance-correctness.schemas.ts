import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const daySession = z.enum(["FULL", "MORNING", "AFTERNOON"]);

const dayInput = z.object({
  date: isoDate,
  session: daySession.default("FULL")
});

export const createCorrectnessRequestsSchema = z.object({
  body: z
    .object({
      /** @deprecated Prefer `days` with per-date session. */
      dates: z.array(isoDate).min(1).max(31).optional(),
      days: z.array(dayInput).min(1).max(31).optional(),
      note: z.string().trim().max(1000).optional()
    })
    .superRefine((body, ctx) => {
      if (!body.days?.length && !body.dates?.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one date", path: ["days"] });
      }
    })
});

export const myCorrectnessRequestsSchema = z.object({
  query: z.object({
    from: isoDate.optional(),
    to: isoDate.optional()
  })
});

export const adminCorrectnessListSchema = z.object({
  query: z.object({
    date: isoDate.optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
    officeId: z.string().uuid().optional()
  })
});

export const correctnessDecisionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ adminNote: z.string().trim().max(1000).optional() })
});
