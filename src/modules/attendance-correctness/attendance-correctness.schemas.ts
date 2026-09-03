import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createCorrectnessRequestsSchema = z.object({
  body: z.object({
    dates: z.array(isoDate).min(1).max(31),
    note: z.string().trim().max(1000).optional()
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
