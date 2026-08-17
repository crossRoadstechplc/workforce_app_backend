ALTER TYPE "NotificationType" ADD VALUE 'EVALUATION_OPENED';
ALTER TYPE "NotificationType" ADD VALUE 'EVALUATION_SELF_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'EVALUATION_SCORED';
ALTER TYPE "NotificationType" ADD VALUE 'EVALUATION_FINALIZED';

CREATE TYPE "EvaluationCycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "EvaluationStatus" AS ENUM ('OPEN', 'SELF_DRAFT', 'SELF_SUBMITTED', 'EVALUATOR_DRAFT', 'EVALUATOR_SUBMITTED', 'FINALIZED');
CREATE TYPE "EvaluationItemSection" AS ENUM ('METRIC', 'RESPONSIBILITY', 'SKILL_IMPROVED', 'GOAL');

ALTER TABLE "employees" ADD COLUMN "supervisor_id" UUID;
CREATE INDEX "employees_supervisor_id_idx" ON "employees"("supervisor_id");
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "evaluation_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "job_title_hint" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evaluation_templates_organization_id_is_active_idx" ON "evaluation_templates"("organization_id", "is_active");
ALTER TABLE "evaluation_templates" ADD CONSTRAINT "evaluation_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "evaluation_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "section" "EvaluationItemSection" NOT NULL,
    "item_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_template_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_template_items_template_id_item_key_key" ON "evaluation_template_items"("template_id", "item_key");
CREATE INDEX "evaluation_template_items_template_id_sort_order_idx" ON "evaluation_template_items"("template_id", "sort_order");
ALTER TABLE "evaluation_template_items" ADD CONSTRAINT "evaluation_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "evaluation_cycles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "number_prefix" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "self_due_at" TIMESTAMPTZ(6),
    "evaluator_due_at" TIMESTAMPTZ(6),
    "status" "EvaluationCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_cycles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evaluation_cycles_organization_id_status_idx" ON "evaluation_cycles"("organization_id", "status");
CREATE INDEX "evaluation_cycles_organization_id_period_start_period_end_idx" ON "evaluation_cycles"("organization_id", "period_start", "period_end");
ALTER TABLE "evaluation_cycles" ADD CONSTRAINT "evaluation_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_cycles" ADD CONSTRAINT "evaluation_cycles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_id" UUID,
    "number" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'OPEN',
    "template_snapshot" JSONB NOT NULL,
    "period_snapshot" JSONB NOT NULL,
    "focus_competency" TEXT,
    "action_plan" TEXT,
    "overall_self" DECIMAL(4,2),
    "overall_evaluator" DECIMAL(4,2),
    "self_submitted_at" TIMESTAMPTZ(6),
    "evaluator_user_id" UUID,
    "evaluator_submitted_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluations_cycle_id_employee_id_key" ON "evaluations"("cycle_id", "employee_id");
CREATE UNIQUE INDEX "evaluations_organization_id_number_key" ON "evaluations"("organization_id", "number");
CREATE INDEX "evaluations_organization_id_status_idx" ON "evaluations"("organization_id", "status");
CREATE INDEX "evaluations_employee_id_status_idx" ON "evaluations"("employee_id", "status");
CREATE INDEX "evaluations_cycle_id_status_idx" ON "evaluations"("cycle_id", "status");
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_user_id_fkey" FOREIGN KEY ("evaluator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "evaluation_scores" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "section" "EvaluationItemSection" NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "self_score" INTEGER,
    "evaluator_score" INTEGER,
    "evaluator_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_scores_evaluation_id_item_key_key" ON "evaluation_scores"("evaluation_id", "item_key");
CREATE INDEX "evaluation_scores_evaluation_id_sort_order_idx" ON "evaluation_scores"("evaluation_id", "sort_order");
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "evaluation_goals" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "skill" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "previous_self_score" INTEGER,
    "previous_evaluator_score" INTEGER,
    "improvement_self_score" INTEGER,
    "improvement_evaluator_score" INTEGER,
    "target_date" DATE,
    "criteria" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evaluation_goals_evaluation_id_sort_order_idx" ON "evaluation_goals"("evaluation_id", "sort_order");
ALTER TABLE "evaluation_goals" ADD CONSTRAINT "evaluation_goals_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
