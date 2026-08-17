import { z } from "zod";

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((v) => new Date(`${v}T00:00:00.000Z`));
const optionalDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .optional()
  .nullable();
const score = z.number().int().min(1).max(10);
const optionalScore = score.optional().nullable();
const uuid = z.string().uuid();
const evaluationStatus = z.enum([
  "OPEN",
  "SELF_DRAFT",
  "SELF_SUBMITTED",
  "EVALUATOR_DRAFT",
  "EVALUATOR_SUBMITTED",
  "FINALIZED"
]);
const itemSection = z.enum(["METRIC", "RESPONSIBILITY", "SKILL_IMPROVED", "GOAL"]);

export const evaluationIdSchema = z.object({ params: z.object({ id: uuid }) });
export const cycleIdSchema = z.object({ params: z.object({ id: uuid }) });
export const templateIdSchema = z.object({ params: z.object({ id: uuid }) });

export const listMyEvaluationsSchema = z.object({
  query: z.object({
    ...page,
    status: evaluationStatus.optional()
  })
});

export const employeeDraftSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    scores: z
      .array(
        z.object({
          itemKey: z.string().min(1).max(120),
          selfScore: optionalScore
        })
      )
      .optional(),
    goals: z
      .array(
        z.object({
          id: uuid,
          improvementSelfScore: optionalScore,
          targetDate: optionalDateString,
          criteria: z.string().trim().max(2000).optional().nullable()
        })
      )
      .optional()
  })
});

export const employeeSubmitSchema = z.object({ params: z.object({ id: uuid }), body: z.object({}).optional() });

export const adminEvaluationListSchema = z.object({
  query: z.object({
    ...page,
    status: evaluationStatus.optional(),
    cycleId: uuid.optional(),
    officeId: uuid.optional(),
    employeeId: uuid.optional(),
    search: z.string().trim().max(100).optional(),
    myReports: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true")
  })
});

export const adminEvaluatorDraftSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    scores: z
      .array(
        z.object({
          itemKey: z.string().min(1).max(120),
          evaluatorScore: optionalScore,
          evaluatorComment: z.string().trim().max(2000).optional().nullable()
        })
      )
      .optional(),
    goals: z
      .array(
        z.object({
          id: uuid,
          improvementEvaluatorScore: optionalScore,
          targetDate: optionalDateString,
          criteria: z.string().trim().max(2000).optional().nullable()
        })
      )
      .optional(),
    focusCompetency: z.string().trim().max(4000).optional().nullable(),
    actionPlan: z.string().trim().max(4000).optional().nullable()
  })
});

export const createCycleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(200),
      periodStart: dateString,
      periodEnd: dateString,
      selfDueAt: z.coerce.date().optional().nullable(),
      evaluatorDueAt: z.coerce.date().optional().nullable(),
      numberPrefix: z.string().trim().max(40).optional().nullable(),
      officeId: uuid.optional().nullable(),
      employeeIds: z.array(uuid).max(500).optional(),
      allActive: z.boolean().optional(),
      templateId: uuid.optional().nullable(),
      open: z.boolean().optional()
    })
    .refine((v) => v.periodEnd >= v.periodStart, { message: "periodEnd must be on or after periodStart", path: ["periodEnd"] })
});

export const listCyclesSchema = z.object({
  query: z.object({
    ...page,
    status: z.enum(["DRAFT", "OPEN", "CLOSED"]).optional()
  })
});

const templateItemSchema = z.object({
  section: itemSection,
  itemKey: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().min(0).max(10000)
});

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    jobTitleHint: z.string().trim().max(200).optional().nullable(),
    isDefault: z.boolean().optional(),
    items: z.array(templateItemSchema).min(1).max(80)
  })
});

export const updateTemplateSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    jobTitleHint: z.string().trim().max(200).optional().nullable(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    items: z.array(templateItemSchema).min(1).max(80).optional()
  })
});

export const openCycleSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      officeId: uuid.optional().nullable(),
      employeeIds: z.array(uuid).max(500).optional(),
      allActive: z.boolean().optional(),
      templateId: uuid.optional().nullable()
    })
    .optional()
    .default({})
});

export const cycleExportSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({ format: z.enum(["json", "csv"]).default("csv") })
});
