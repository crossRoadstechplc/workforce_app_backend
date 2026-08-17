import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import { softwareEngineerTemplateItems, SOFTWARE_ENGINEER_TEMPLATE_NAME } from "../../../src/modules/performance/default-template.js";

export async function seedEvaluationTemplate(prisma: PrismaClient, organizationId: string) {
  const existing = await prisma.evaluationTemplate.findFirst({
    where: { organizationId, name: SOFTWARE_ENGINEER_TEMPLATE_NAME }
  });
  if (existing) return existing;
  const hasDefault = await prisma.evaluationTemplate.findFirst({ where: { organizationId, isDefault: true } });
  return prisma.evaluationTemplate.create({
    data: {
      organizationId,
      name: SOFTWARE_ENGINEER_TEMPLATE_NAME,
      description: "Internal performance evaluation for software engineers (full stack).",
      jobTitleHint: "Software Engineer",
      isDefault: !hasDefault,
      items: { create: softwareEngineerTemplateItems }
    }
  });
}
