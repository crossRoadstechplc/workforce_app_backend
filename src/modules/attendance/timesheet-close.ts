import type { AttendanceStatus, CheckOutSource } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOfficeDisplay, emitToOrgAdmins, emitToUser } from "../../realtime/socket.server.js";
import { formatWorkDateKey, todayWorkDateKey } from "../../shared/work-date.js";
import { computeCheckoutMetrics } from "./auto-checkout.logic.js";

type OpenTimesheet = {
  id: string;
  employeeId: string;
  workDate: Date;
  actualCheckIn: Date;
  scheduledCheckOut: Date;
  timezone: string;
  isLate: boolean;
  isMissingCheckout: boolean;
  isOpen: boolean;
  officeAllowedRadiusMeters: number;
};

type CheckoutLocationCreate = {
  type: "CHECK_OUT";
  source: "GPS" | "DESKTOP";
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceFromOfficeMeters: number | null;
  allowedRadiusMeters: number;
  isInsideRadius: boolean;
  capturedAt: Date | null;
  serverReceivedAt: Date;
  photoUrl: string | null;
};

export async function closeOpenTimesheet(input: {
  open: OpenTimesheet;
  checkoutAt: Date;
  source: CheckOutSource;
  userId: string;
  organizationId: string;
  officeId: string | null;
  idempotencyKey: string;
  checkoutLocation?: CheckoutLocationCreate;
  workDescription?: string;
}) {
  const { open, checkoutAt, source, userId, organizationId, officeId, idempotencyKey } = input;
  const metrics = computeCheckoutMetrics(open, checkoutAt);
  const completedStatus = open.isLate ? "COMPLETED_LATE" : "COMPLETED_ON_TIME";
  const closedCarriedOverShift = formatWorkDateKey(open.workDate) < todayWorkDateKey(open.timezone);
  const workDescription = input.workDescription?.trim();
  const createWorksheet = Boolean(workDescription);

  let status: AttendanceStatus =
    metrics.isMissingCheckout || open.isMissingCheckout ? "MISSING_CHECKOUT" : completedStatus;
  let isMissingCheckout = open.isMissingCheckout || metrics.isMissingCheckout;
  if (source === "SYSTEM") {
    status = "MISSING_CHECKOUT";
    isMissingCheckout = true;
  }

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.timesheet.updateMany({
      where: { id: open.id, isOpen: true },
      data: {
        actualCheckOut: checkoutAt,
        workedMinutes: metrics.workedMinutes,
        earlyCheckoutMinutes: metrics.earlyCheckoutMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        isEarlyCheckout: metrics.isEarlyCheckout,
        isMissingCheckout,
        isOpen: false,
        status,
        checkOutSource: source,
        checkOutIdempotencyKey: idempotencyKey,
        ...(input.checkoutLocation ? { locations: { create: input.checkoutLocation } } : {}),
        ...(createWorksheet
          ? {
              worksheet: {
                create: {
                  employeeId: open.employeeId,
                  workDate: open.workDate,
                  workDescription: workDescription!,
                  submittedAt: checkoutAt
                }
              }
            }
          : {})
      }
    });
    if (!changed.count) throw new AppError(409, "TIMESHEET_ALREADY_CLOSED", "Timesheet is already closed");

    const timesheet = await tx.timesheet.findUniqueOrThrow({
      where: { id: open.id },
      include: { worksheet: true, lateReason: true, locations: true }
    });

    const notification =
      source === "SYSTEM"
        ? await tx.notification.create({
            data: {
              userId,
              type: "CHECK_OUT_AUTO",
              title: "Automatic checkout",
              message: closedCarriedOverShift
                ? `Your open shift was closed automatically at the configured checkout time. Worked time: ${metrics.workedMinutes} minutes.`
                : `You were checked out automatically at the configured time. Worked time: ${metrics.workedMinutes} minutes.`,
              relatedEntityType: "Timesheet",
              relatedEntityId: timesheet.id
            }
          })
        : await tx.notification.create({
            data: {
              userId,
              type: "CHECK_OUT_SUCCESS",
              title: closedCarriedOverShift ? "Previous shift closed" : "Checkout successful",
              message: closedCarriedOverShift
                ? `Your open shift from ${formatWorkDateKey(open.workDate)} is closed. Worked time: ${metrics.workedMinutes} minutes. You can check in for today.`
                : `You checked out successfully. Worked time: ${metrics.workedMinutes} minutes.`,
              relatedEntityType: "Timesheet",
              relatedEntityId: timesheet.id
            }
          });

    return { timesheet, notification, metrics, closedCarriedOverShift };
  });

  await deliverNotification(result.notification);
  emitToUser(userId, "attendance.checked_out", {
    timesheetId: result.timesheet.id,
    workedMinutes: result.metrics.workedMinutes,
    closedCarriedOverShift: result.closedCarriedOverShift,
    checkOutSource: source
  });
  emitToOrgAdmins(organizationId, "employee.checked_out", {
    employeeId: open.employeeId,
    timesheetId: result.timesheet.id,
    workedMinutes: result.metrics.workedMinutes,
    checkOutSource: source
  });
  if (officeId) {
    emitToOfficeDisplay(organizationId, officeId, "display.people_changed", { employeeId: open.employeeId });
  }

  return result.timesheet;
}
