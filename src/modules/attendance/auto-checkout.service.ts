import { prisma } from "../../database/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  isEligibleForAutoCheckout,
  resolveAutoCheckoutInstant,
  systemAutoCheckoutIdempotencyKey
} from "./auto-checkout.logic.js";
import { closeOpenTimesheet } from "./timesheet-close.js";

export const autoCheckoutService = {
  async run(now = new Date()) {
    const openRows = await prisma.timesheet.findMany({
      where: { isOpen: true, actualCheckOut: null },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            officeId: true,
            organization: {
              select: {
                attendanceAutoCheckoutEnabled: true,
                attendanceAutoCheckoutTime: true
              }
            },
            office: { select: { timezone: true } }
          }
        }
      }
    });

    let closed = 0;
    for (const row of openRows) {
      const org = row.employee.organization;
      if (!org.attendanceAutoCheckoutEnabled) continue;
      const timezone = row.timezone || row.employee.office?.timezone || "UTC";
      const autoCheckoutAt = resolveAutoCheckoutInstant(timezone, org.attendanceAutoCheckoutTime, now);
      if (!isEligibleForAutoCheckout(row.actualCheckIn, autoCheckoutAt, now)) continue;

      try {
        await closeOpenTimesheet({
          open: row,
          checkoutAt: autoCheckoutAt,
          source: "SYSTEM",
          userId: row.employee.userId,
          organizationId: row.employee.organizationId,
          officeId: row.employee.officeId,
          idempotencyKey: systemAutoCheckoutIdempotencyKey(row.id)
        });
        closed++;
      } catch (error) {
        if (error instanceof AppError && error.code === "TIMESHEET_ALREADY_CLOSED") continue;
        logger.warn({ err: error, timesheetId: row.id }, "Auto-checkout failed for timesheet");
      }
    }

    return { closed };
  }
};
