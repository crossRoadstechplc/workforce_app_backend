import "dotenv/config";
import { prisma } from "../database/prisma.js";
import { logger } from "../config/logger.js";
import { autoCheckoutService } from "../modules/attendance/auto-checkout.service.js";

async function run() {
  const result = await autoCheckoutService.run();
  logger.info(result, "Auto-checkout scan completed");
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Auto-checkout scan failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
