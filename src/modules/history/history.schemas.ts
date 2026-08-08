import { z } from "zod";
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) };
export const employeeHistorySchema = z.object({ query: z.object({ ...page, from: z.coerce.date().optional(), to: z.coerce.date().optional() }) });
export const calendarSchema = z.object({ query: z.object({ year: z.coerce.number().int().min(2000).max(2200), month: z.coerce.number().int().min(1).max(12) }) });
export const idSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const adminTimesheetListSchema = z.object({ query: z.object({ ...page, employeeId: z.string().uuid().optional(), officeId: z.string().uuid().optional(), status: z.enum(["OPEN","PRESENT_ON_TIME","PRESENT_LATE","COMPLETED_ON_TIME","COMPLETED_LATE","MISSING_CHECKOUT"]).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) });
export const correctionSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ actualCheckIn: z.coerce.date().optional(), actualCheckOut: z.coerce.date().optional(), reason: z.string().trim().min(5).max(1000) }).refine(v => v.actualCheckIn || v.actualCheckOut, "At least one corrected time is required") });
export const worksheetReviewSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ adminComment: z.string().trim().min(2).max(2000).optional() }) });
