import { z } from "zod";
import { easyPasswordSchema } from "../../shared/password.js";

const employeeStatus = z.enum(["ACTIVE", "INACTIVE", "TERMINATED"]);
const userStatus = z.enum(["ACTIVE", "INACTIVE"]);
export const emergencyContactRelation = z.enum([
  "MOTHER",
  "FATHER",
  "BROTHER",
  "SISTER",
  "SPOUSE",
  "CHILD",
  "FRIEND",
  "RELATIVE",
  "OTHER"
]);
const optionalText = z.string().trim().max(200).optional().nullable();
const optionalEmployeeCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()).optional()
);
/** Empty / missing birth date stays null. Never required, never crashes. */
const optionalBirthDate = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.date().nullable()
);

function refineRelationOther<T extends { relation?: string; relationOther?: string | null }>(value: T, ctx: z.RefinementCtx) {
  if (value.relation === "OTHER") {
    const other = value.relationOther?.trim();
    if (!other) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["relationOther"],
        message: "Specify the relationship when Other is selected"
      });
    }
  }
}

export const createEmployeeSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  employeeCode: optionalEmployeeCode,
  firstName: z.string().trim().min(1).max(100),
  middleName: optionalText,
  lastName: z.string().trim().min(1).max(100),
  phone: optionalText,
  jobTitle: optionalText,
  departmentId: z.string().uuid().optional().nullable(),
  evaluationTemplateId: z.string().uuid().optional().nullable(),
  employmentStartDate: z.coerce.date(),
  birthDate: optionalBirthDate.optional(),
  officeId: z.string().uuid().optional().nullable(),
  scheduleId: z.string().uuid().optional().nullable(),
  supervisorId: z.string().uuid().optional().nullable(),
  temporaryPassword: easyPasswordSchema.optional()
});

export const updateEmployeeSchema = z
  .object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
    employeeCode: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    middleName: optionalText,
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: optionalText,
    jobTitle: optionalText,
    departmentId: z.string().uuid().optional().nullable(),
    evaluationTemplateId: z.string().uuid().optional().nullable(),
    employmentStartDate: z.coerce.date().optional(),
    birthDate: optionalBirthDate.optional(),
    officeId: z.string().uuid().optional().nullable(),
    scheduleId: z.string().uuid().optional().nullable(),
    supervisorId: z.string().uuid().optional().nullable()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const employeeStatusSchema = z.object({
  employeeStatus,
  userStatus: userStatus.optional(),
  reason: z.string().trim().min(3).max(500)
});

export const resetPasswordSchema = z.object({
  temporaryPassword: easyPasswordSchema.optional(),
  reason: z.string().trim().min(3).max(500)
});

export const employeeParamsSchema = z.object({ employeeId: z.string().uuid() });

export const emergencyContactBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(1).max(40),
    relation: emergencyContactRelation.optional().nullable(),
    relationOther: optionalText
  })
  .superRefine(refineRelationOther);

export const emergencyContactUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    relation: emergencyContactRelation.optional(),
    relationOther: optionalText
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .superRefine((value, ctx) => {
    if (value.relation === "OTHER") {
      const other = value.relationOther?.trim();
      if (!other) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["relationOther"],
          message: "Specify the relationship when Other is selected"
        });
      }
    }
  });

export const emergencyContactParamsSchema = z.object({ contactId: z.string().uuid() });
export const adminEmergencyContactParamsSchema = z.object({
  employeeId: z.string().uuid(),
  contactId: z.string().uuid()
});

export const employeeListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: employeeStatus.optional(),
  officeId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional()
});
