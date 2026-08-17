import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  adminCycle,
  adminCycles,
  adminEvaluation,
  adminEvaluations,
  adminTemplate,
  adminTemplates,
  closeCycle,
  createCycle,
  createTemplate,
  exportCycle,
  finalizeEvaluation,
  myEvaluation,
  myEvaluations,
  openCycle,
  saveAdminEvaluation,
  saveMyEvaluation,
  submitAdminEvaluation,
  submitMyEvaluation,
  updateTemplate
} from "./performance.controller.js";
import {
  adminEvaluationListSchema,
  adminEvaluatorDraftSchema,
  createCycleSchema,
  createTemplateSchema,
  cycleExportSchema,
  cycleIdSchema,
  employeeDraftSchema,
  employeeSubmitSchema,
  evaluationIdSchema,
  listCyclesSchema,
  listMyEvaluationsSchema,
  openCycleSchema,
  templateIdSchema,
  updateTemplateSchema
} from "./performance.schemas.js";

export const evaluationRouter = Router();
evaluationRouter.use(authenticate, requireNormalSession);
evaluationRouter.get("/", requirePermission("evaluation.view_own"), validate(listMyEvaluationsSchema), myEvaluations);
evaluationRouter.get("/:id", requirePermission("evaluation.view_own"), validate(evaluationIdSchema), myEvaluation);
evaluationRouter.patch("/:id", requirePermission("evaluation.submit_own"), validate(employeeDraftSchema), saveMyEvaluation);
evaluationRouter.post("/:id/submit", requirePermission("evaluation.submit_own"), validate(employeeSubmitSchema), submitMyEvaluation);

export const adminEvaluationRouter = Router();
adminEvaluationRouter.use(authenticate, requireNormalSession, requireOrgContext);
adminEvaluationRouter.get("/templates", requirePermission("evaluation.template.manage"), adminTemplates);
adminEvaluationRouter.get("/templates/:id", requirePermission("evaluation.template.manage"), validate(templateIdSchema), adminTemplate);
adminEvaluationRouter.post("/templates", requireOrgAdmin, requirePermission("evaluation.template.manage"), validate(createTemplateSchema), createTemplate);
adminEvaluationRouter.patch("/templates/:id", requireOrgAdmin, requirePermission("evaluation.template.manage"), validate(updateTemplateSchema), updateTemplate);
adminEvaluationRouter.get("/cycles", requirePermission("evaluation.view_office"), validate(listCyclesSchema), adminCycles);
adminEvaluationRouter.get("/cycles/:id", requirePermission("evaluation.view_office"), validate(cycleIdSchema), adminCycle);
adminEvaluationRouter.post("/cycles", requireOrgAdmin, requirePermission("evaluation.cycle.manage"), validate(createCycleSchema), createCycle);
adminEvaluationRouter.post("/cycles/:id/open", requireOrgAdmin, requirePermission("evaluation.cycle.manage"), validate(openCycleSchema), openCycle);
adminEvaluationRouter.post("/cycles/:id/close", requireOrgAdmin, requirePermission("evaluation.cycle.manage"), validate(cycleIdSchema), closeCycle);
adminEvaluationRouter.get("/cycles/:id/export", requirePermission("evaluation.cycle.manage"), validate(cycleExportSchema), exportCycle);
adminEvaluationRouter.get("/", requirePermission("evaluation.view_office"), validate(adminEvaluationListSchema), adminEvaluations);
adminEvaluationRouter.get("/:id", requirePermission("evaluation.view_office"), validate(evaluationIdSchema), adminEvaluation);
adminEvaluationRouter.patch("/:id", requirePermission("evaluation.review"), validate(adminEvaluatorDraftSchema), saveAdminEvaluation);
adminEvaluationRouter.post("/:id/submit", requirePermission("evaluation.review"), validate(evaluationIdSchema), submitAdminEvaluation);
adminEvaluationRouter.post("/:id/finalize", requireOrgAdmin, requirePermission("evaluation.finalize"), validate(evaluationIdSchema), finalizeEvaluation);
