import type { Prisma } from "../generated/prisma/client.js";

export function organizationCodePrefix(slug: string): string {
  const alpha = slug.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (alpha.slice(0, 3) || "EMP").padEnd(3, "X");
}

export async function generateEmployeeCode(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<string> {
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { slug: true }
  });
  const prefix = organizationCodePrefix(org.slug);
  const pattern = new RegExp(`^${prefix}(\\d+)$`);

  const existing = await tx.employee.findMany({
    where: { organizationId, employeeCode: { startsWith: prefix } },
    select: { employeeCode: true }
  });

  let maxNum = 0;
  for (const { employeeCode } of existing) {
    const match = employeeCode.match(pattern);
    if (match) maxNum = Math.max(maxNum, Number.parseInt(match[1]!, 10));
  }

  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}
