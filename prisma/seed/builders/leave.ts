import { DateTime } from "luxon";
import type { PrismaClient } from "../../../src/generated/prisma/client.js";
import type { OrganizationFixture } from "../types.js";
import type { EmployeeMap } from "./employee.js";

function leaveDates(scenario: OrganizationFixture["leaveScenarios"][number]) {
  const zone = "Africa/Addis_Ababa";
  const base =
    scenario.startDaysFromNow !== undefined
      ? DateTime.now().setZone(zone).plus({ days: scenario.startDaysFromNow })
      : DateTime.now().setZone(zone).minus({ days: scenario.startDaysAgo ?? 0 });

  const start = base.startOf("day");
  let end = start;
  let remaining = scenario.days - 1;
  while (remaining > 0) {
    end = end.plus({ days: 1 });
    if ([1, 2, 3, 4, 5].includes(end.weekday)) remaining--;
  }

  return {
    startDate: new Date(Date.UTC(start.year, start.month - 1, start.day)),
    endDate: new Date(Date.UTC(end.year, end.month - 1, end.day))
  };
}

export async function seedLeaveScenarios(
  prisma: PrismaClient,
  organizationId: string,
  fixture: OrganizationFixture,
  employees: EmployeeMap,
  leaveTypeMap: Map<string, string>,
  orgAdminUserId: string
) {
  for (const scenario of fixture.leaveScenarios) {
    const emp = employees.get(scenario.employeeCode);
    const leaveTypeId = leaveTypeMap.get(scenario.leaveType);
    if (!emp || !leaveTypeId) continue;

    const { startDate, endDate } = leaveDates(scenario);
    const reason = scenario.reason ?? `Demo leave request for ${scenario.employeeCode}`;

    const existing = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: emp.id,
        leaveTypeId,
        startDate,
        endDate,
        reason
      }
    });

    const request =
      existing ??
      (await prisma.leaveRequest.create({
        data: {
          employeeId: emp.id,
          leaveTypeId,
          startDate,
          endDate,
          numberOfDays: scenario.days,
          reason,
          status: scenario.status === "PENDING" ? "PENDING" : scenario.status
        }
      }));

    if (scenario.status !== "PENDING" && scenario.status !== "CANCELLED") {
      const decision = scenario.status === "APPROVED" ? "APPROVED" : "REJECTED";
      const hasDecision = await prisma.leaveDecision.findFirst({ where: { leaveRequestId: request.id } });
      if (!hasDecision) {
        await prisma.leaveDecision.create({
          data: {
            leaveRequestId: request.id,
            adminUserId: orgAdminUserId,
            decision,
            decisionReason: scenario.decisionReason ?? (decision === "REJECTED" ? "Insufficient coverage" : null)
          }
        });
      }
      if (request.status !== scenario.status) {
        await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: scenario.status } });
      }
    }

    if (scenario.status === "PENDING") {
      const note = await prisma.notification.findFirst({
        where: { userId: orgAdminUserId, relatedEntityId: request.id, type: "LEAVE_SUBMITTED" }
      });
      if (!note) {
        await prisma.notification.create({
          data: {
            userId: orgAdminUserId,
            type: "LEAVE_SUBMITTED",
            title: "New leave request",
            message: `Demo leave submitted by ${scenario.employeeCode}`,
            relatedEntityType: "LeaveRequest",
            relatedEntityId: request.id
          }
        });
      }
    }
  }
}
