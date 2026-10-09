import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { birthdayTimezone, formatBirthdayPersonName, isBirthdayOnDate } from "../../shared/birthday.js";
import { deliverNotification } from "../notifications/notification.service.js";

export const birthdayWishService = {
  async run(now = DateTime.now()) {
    const employees = await prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        birthDate: { not: null },
        user: { status: "ACTIVE" }
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        organization: { select: { name: true } },
        office: { select: { timezone: true } },
        schedule: { select: { timezone: true } }
      }
    });

    let sent = 0;
    let skipped = 0;

    for (const employee of employees) {
      if (!employee.birthDate) continue;
      const zone = birthdayTimezone(employee.office?.timezone, employee.schedule?.timezone);
      if (!isBirthdayOnDate(employee.birthDate, now, zone)) {
        skipped++;
        continue;
      }

      const wishYear = now.setZone(zone).year;
      const existing = await prisma.birthdayWishLog.findUnique({
        where: { employeeId_wishYear: { employeeId: employee.id, wishYear } }
      });
      if (existing) {
        skipped++;
        continue;
      }

      const orgName = employee.organization.name?.trim() || "SPX";
      const name = formatBirthdayPersonName(employee);

      try {
        const notification = await prisma.$transaction(async (tx) => {
          await tx.birthdayWishLog.create({
            data: { employeeId: employee.id, wishYear }
          });
          return tx.notification.create({
            data: {
              userId: employee.userId,
              type: "BIRTHDAY_WISH",
              title: "Happy Birthday!",
              message: `Happy Birthday, ${name}! Wishing you a wonderful day from ${orgName}.`,
              relatedEntityType: "Employee",
              relatedEntityId: employee.id
            }
          });
        });
        await deliverNotification(notification);
        sent++;
      } catch {
        // Unique constraint race from overlapping cron runs.
        skipped++;
      }
    }

    return { scanned: employees.length, sent, skipped };
  }
};
