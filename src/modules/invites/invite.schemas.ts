import { z } from "zod";

export const invitePasswordSchema = z.string().min(10).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);

export const inviteTokenParamsSchema = z.object({
  token: z.string().min(20)
});

export const inviteIdParamsSchema = z.object({
  id: z.string().uuid()
});

export const acceptAdminSchema = z.object({
  password: invitePasswordSchema
});

export const acceptEmployeeSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(200).optional().nullable(),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(200).optional().nullable(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  department: z.string().trim().max(200).optional().nullable(),
  employmentStartDate: z.coerce.date(),
  employeeCode: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()).optional()
  ),
  officeId: z.string().uuid().optional().nullable(),
  scheduleId: z.string().uuid().optional().nullable(),
  password: invitePasswordSchema
});

export const createEmployeeInviteSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  officeId: z.string().uuid().optional().nullable(),
  scheduleId: z.string().uuid().optional().nullable(),
  employmentStartDate: z.coerce.date().optional(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  department: z.string().trim().max(200).optional().nullable()
});

export const inviteListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(["ORG_ADMIN", "OFFICE_ADMIN", "EMPLOYEE"]).optional(),
  status: z.enum(["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"]).optional(),
  organizationId: z.string().uuid().optional()
});
