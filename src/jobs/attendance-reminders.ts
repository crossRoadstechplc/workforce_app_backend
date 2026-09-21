import "dotenv/config";
import { prisma } from "../database/prisma.js";
import { logger } from "../config/logger.js";
import { attendanceReminderService } from "../modules/attendance/attendance-reminder.service.js";

async function run() {
  const result = await attendanceReminderService.run();
  logger.info(result, "Attendance reminder scan completed");
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Attendance reminder scan failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
