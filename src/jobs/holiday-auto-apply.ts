import "dotenv/config";
import { prisma } from "../database/prisma.js";
import { logger } from "../config/logger.js";
import { holidayService } from "../modules/holidays/holiday.service.js";

async function run() {
  const result = await holidayService.runAutoApplyJob();
  logger.info(result, "Holiday auto-apply scan completed");
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Holiday auto-apply scan failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
