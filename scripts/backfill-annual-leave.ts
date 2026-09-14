import "dotenv/config";
import { prisma } from "../src/database/prisma.js";
import { annualLeaveService } from "../src/modules/leave/annual-leave.service.js";

async function main() {
  const employees = await prisma.employee.findMany({ select: { id: true, employeeCode: true } });
  let ok = 0;
  let failed = 0;
  for (const employee of employees) {
    try {
      await prisma.$transaction(async (tx) => {
        await annualLeaveService.rebuild(tx, employee.id);
      });
      ok += 1;
      console.log(`ok ${employee.employeeCode}`);
    } catch (error) {
      failed += 1;
      console.error(`fail ${employee.employeeCode}`, error);
    }
  }
  console.log(`Annual leave backfill complete. ok=${ok} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
