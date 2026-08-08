import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((v) => new Date(`${v}T00:00:00.000Z`));

export const dashboardRangeSchema = z.object({
  query: z.object({
    date: dateString.optional(),
    officeId: z.string().uuid().optional()
  })
});

export const trendSchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    officeId: z.string().uuid().optional()
  }).refine((v) => v.to >= v.from, { message: "to must be on or after from", path: ["to"] })
});

export const reportListSchema = z.object({
  query: z.object({
    from: dateString,
    to: dateString,
    employeeId: z.string().uuid().optional(),
    officeId: z.string().uuid().optional(),
    status: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    format: z.enum(["json", "csv"]).default("json")
  }).refine((v) => v.to >= v.from, { message: "to must be on or after from", path: ["to"] })
});

export const employeeReportSchema = z.object({
  params: z.object({ employeeId: z.string().uuid() }),
  query: z.object({
    from: dateString,
    to: dateString
  }).refine((v) => v.to >= v.from, { message: "to must be on or after from", path: ["to"] })
});
