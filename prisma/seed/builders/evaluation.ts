import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import { STANDARD_PERFORMANCE_TEMPLATE_NAME, standardPerformanceTemplateItems } from "../../../src/modules/performance/default-template.js";

export async function seedEvaluationTemplate(prisma: PrismaClient, organizationId: string) {
  const existing = await prisma.evaluationTemplate.findFirst({
    where: { organizationId, name: STANDARD_PERFORMANCE_TEMPLATE_NAME }
  });
  if (existing) return existing;
  await prisma.evaluationTemplate.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
  await prisma.evaluationTemplate.updateMany({
    where: { organizationId, name: "Internal — Software Engineer" },
    data: { isActive: false, isDefault: false }
  });
  return prisma.evaluationTemplate.create({
    data: {
      organizationId,
      name: STANDARD_PERFORMANCE_TEMPLATE_NAME,
      description: "Standard 10-area evaluation (1–5). Reliability and Attendance is rated from late and unexcused absence.",
      isDefault: true,
      items: { create: standardPerformanceTemplateItems }
    }
  });
}
