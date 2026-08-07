import { z } from "zod";

const employeeStatus = z.enum(["ACTIVE", "INACTIVE", "TERMINATED"]);
const userStatus = z.enum(["ACTIVE", "INACTIVE"]);
const optionalText = z.string().trim().max(200).optional().nullable();

export const createEmployeeSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  employeeCode: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()),
  firstName: z.string().trim().min(1).max(100),
  middleName: optionalText,
  lastName: z.string().trim().min(1).max(100),
  phone: optionalText,
  jobTitle: optionalText,
  department: optionalText,
  employmentStartDate: z.coerce.date(),
  officeId: z.string().uuid().optional().nullable(),
  scheduleId: z.string().uuid().optional().nullable(),
  temporaryPassword: z.string().min(10).max(128).optional()
});

export const updateEmployeeSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  employeeCode: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  middleName: optionalText,
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: optionalText,
  jobTitle: optionalText,
  department: optionalText,
  employmentStartDate: z.coerce.date().optional(),
  officeId: z.string().uuid().optional().nullable(),
  scheduleId: z.string().uuid().optional().nullable()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const employeeStatusSchema = z.object({
  employeeStatus,
  userStatus: userStatus.optional(),
  reason: z.string().trim().min(3).max(500)
});

export const resetPasswordSchema = z.object({
  temporaryPassword: z.string().min(10).max(128).optional(),
  reason: z.string().trim().min(3).max(500)
});

export const employeeParamsSchema = z.object({ employeeId: z.string().uuid() });

export const employeeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: employeeStatus.optional(),
  officeId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().optional(),
  department: z.string().trim().max(100).optional()
});
