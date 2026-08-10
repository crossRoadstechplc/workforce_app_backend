import "dotenv/config";
import { prisma } from "../database/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { deliverNotification } from "../modules/notifications/notification.service.js";
import { emitToOrgRole } from "../realtime/socket.server.js";
import { ROLE } from "../shared/tenancy.js";

async function run() {
  const cutoff = new Date(Date.now() - env.MISSING_CHECKOUT_GRACE_MINUTES * 60_000);
  const candidates = await prisma.timesheet.findMany({
    where: { isOpen: true, isMissingCheckout: false, scheduledCheckOut: { lt: cutoff } },
    include: { employee: true }
  });
  let marked = 0;
  for (const item of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.timesheet.updateMany({
        where: { id: item.id, isOpen: true, isMissingCheckout: false },
        data: { isMissingCheckout: true, status: "MISSING_CHECKOUT" }
      });
      if (!changed.count) return null;
      const notification = await tx.notification.create({
        data: {
          userId: item.employee.userId,
          type: "MISSING_CHECKOUT",
          title: "Missing checkout",
          message:
            "Your workday is still open. Please check out or contact an administrator if a correction is required.",
          relatedEntityType: "Timesheet",
          relatedEntityId: item.id
        }
      });
      return notification;
    });
    if (!result) continue;
    marked++;
    await deliverNotification(result);
    emitToOrgRole(item.employee.organizationId, ROLE.ORG_ADMIN, "attendance.missing_checkout", {
      timesheetId: item.id,
      employeeId: item.employeeId
    });
  }
  logger.info({ marked }, "Missing-checkout scan completed");
}

run()
  .catch((error) => {
    logger.error({ err: error }, "Missing-checkout scan failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
