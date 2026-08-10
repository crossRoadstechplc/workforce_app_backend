import { prisma } from "../../database/prisma.js";
import { getOfficeScope, type OfficeScope } from "../../shared/office-scope.js";

export const tenantContextService = {
  async get(organizationId: string, scope: OfficeScope) {
    const offices = await prisma.office.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(scope.allOffices ? {} : { id: { in: scope.officeIds } })
      },
      select: { id: true, name: true, address: true, timezone: true },
      orderBy: { name: "asc" }
    });
    const schedules = await prisma.workSchedule.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        checkInTime: true,
        checkOutTime: true,
        timezone: true,
        workingDays: true,
        days: {
          select: { weekday: true, checkInTime: true, checkOutTime: true },
          orderBy: { weekday: "asc" }
        }
      },
      orderBy: { name: "asc" }
    });
    return { offices, schedules, scope: scope.allOffices ? "organization" as const : "office" as const };
  }
};
