-- CreateEnum
CREATE TYPE "EmergencyContactRelation" AS ENUM ('MOTHER', 'FATHER', 'BROTHER', 'SISTER', 'SPOUSE', 'CHILD', 'FRIEND', 'RELATIVE', 'OTHER');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "emergency_contact_relation" "EmergencyContactRelation";
ALTER TABLE "employees" ADD COLUMN "emergency_contact_relation_other" TEXT;
