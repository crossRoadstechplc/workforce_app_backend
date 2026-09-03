import { prisma } from "../../database/prisma.js";
import { getOfficeScope, type OfficeScope } from "../../shared/office-scope.js";
import { ensureDefaultTemplate } from "../performance/performance.service.js";
import { LEGACY_EVALUATION_TEMPLATE_NAMES } from "../performance/default-template.js";

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
    const departments = await prisma.department.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    await ensureDefaultTemplate(organizationId);
    const evaluationTemplates = await prisma.evaluationTemplate.findMany({
      where: {
        organizationId,
        isActive: true,
        NOT: {
          OR: [
            { name: { in: [...LEGACY_EVALUATION_TEMPLATE_NAMES] } },
            { items: { some: { section: { in: ["RESPONSIBILITY", "SKILL_IMPROVED", "GOAL"] } } } }
          ]
        }
      },
      select: { id: true, name: true, jobTitleHint: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }]
    });
    return { offices, schedules, departments, evaluationTemplates, scope: scope.allOffices ? "organization" as const : "office" as const };
  }
};
