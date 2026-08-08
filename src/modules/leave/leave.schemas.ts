import { z } from "zod";
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) };
export const createLeaveSchema = z.object({ body: z.object({ leaveTypeId: z.string().uuid(), startDate: z.coerce.date(), endDate: z.coerce.date(), reason: z.string().trim().min(5).max(2000) }) });
export const listMyLeaveSchema = z.object({ query: z.object({ ...page, status: z.enum(["PENDING","APPROVED","REJECTED","CANCELLED"]).optional() }) });
export const leaveIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const adminLeaveListSchema = z.object({ query: z.object({ ...page, status: z.enum(["PENDING","APPROVED","REJECTED","CANCELLED"]).optional(), employeeId: z.string().uuid().optional() }) });
export const approveLeaveSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ reason: z.string().trim().max(1000).optional() }) });
export const rejectLeaveSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ reason: z.string().trim().min(5).max(1000) }) });
export const cancelLeaveSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ reason: z.string().trim().min(3).max(1000).optional() }).default({}) });
