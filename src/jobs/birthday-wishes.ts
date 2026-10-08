import "dotenv/config";
import { prisma } from "../database/prisma.js";
import { logger } from "../config/logger.js";
import { birthdayWishService } from "../modules/employees/birthday-wish.service.js";

async function run() {
  const result = await birthdayWishService.run();
  logger.info(result, "Birthday wish scan completed");
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Birthday wish scan failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
