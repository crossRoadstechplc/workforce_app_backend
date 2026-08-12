import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const dayRosterSchema = z.object({
  query: z.object({
    date: isoDate,
    officeId: z.string().uuid().optional(),
    status: z.string().trim().min(1).max(40).optional()
  })
});

export const monthSummarySchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2200),
    month: z.coerce.number().int().min(1).max(12),
    officeId: z.string().uuid().optional()
  })
});

export const leaveDayRosterSchema = z.object({
  query: z.object({
    date: isoDate,
    officeId: z.string().uuid().optional(),
    status: z.enum(["NONE", "PENDING", "APPROVED", "REJECTED", "CANCELLED", "ON_LEAVE"]).optional()
  })
});

export const worksheetDayRosterSchema = z.object({
  query: z.object({
    date: isoDate,
    officeId: z.string().uuid().optional(),
    status: z.enum(["MISSING", "SUBMITTED", "REVIEWED"]).optional()
  })
});
