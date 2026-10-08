-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY_WISH';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "birth_date" DATE;

-- CreateTable
CREATE TABLE "birthday_wish_logs" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "wish_year" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "birthday_wish_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "birthday_wish_logs_wish_year_idx" ON "birthday_wish_logs"("wish_year");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_wish_logs_employee_id_wish_year_key" ON "birthday_wish_logs"("employee_id", "wish_year");

-- AddForeignKey
ALTER TABLE "birthday_wish_logs" ADD CONSTRAINT "birthday_wish_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
