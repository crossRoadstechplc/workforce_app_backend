ALTER TABLE "attendance_correctness_requests" ADD COLUMN "submission_id" UUID;

UPDATE "attendance_correctness_requests" SET "submission_id" = "id" WHERE "submission_id" IS NULL;

CREATE INDEX "attendance_correctness_requests_organization_id_submission_id_idx" ON "attendance_correctness_requests"("organization_id", "submission_id");
CREATE INDEX "attendance_correctness_requests_employee_id_submission_id_idx" ON "attendance_correctness_requests"("employee_id", "submission_id");
