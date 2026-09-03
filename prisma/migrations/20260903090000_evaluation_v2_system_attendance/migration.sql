CREATE TYPE "EvaluationScoringSource" AS ENUM ('HUMAN', 'SYSTEM_ATTENDANCE');

ALTER TABLE "evaluation_template_items"
  ADD COLUMN "prompt" TEXT,
  ADD COLUMN "scoring_source" "EvaluationScoringSource" NOT NULL DEFAULT 'HUMAN';

ALTER TABLE "evaluation_scores"
  ADD COLUMN "prompt" TEXT,
  ADD COLUMN "scoring_source" "EvaluationScoringSource" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "system_score" INTEGER;
