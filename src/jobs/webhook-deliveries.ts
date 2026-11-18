import "dotenv/config";
import { prisma } from "../database/prisma.js";
import { logger } from "../config/logger.js";
import { webhookService } from "../modules/integrations/webhook.service.js";

/** Retries pending webhook deliveries whose next attempt is due. Does nothing when no integration has a webhook. */
async function run() {
  const result = await webhookService.runDue();
  if (result.processed) logger.info(result, "Webhook delivery retry scan completed");
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Webhook delivery retry scan failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
