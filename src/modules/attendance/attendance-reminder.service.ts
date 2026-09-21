import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToUser } from "../../realtime/socket.server.js";
import { workDateFromKey } from "../../shared/work-date.js";
import { computeDailySchedule, reminderTargetWindow } from "./attendance-schedule.js";

type ReminderCounts = { checkInSent: number; checkOutSent: number };

function reminderMessage(kind: "CHECK_IN" | "CHECK_OUT") {
  const minutes = env.ATTENDANCE_REMINDER_MINUTES;
  if (kind === "CHECK_IN") {
    return {
      type: "CHECK_IN_REMINDER" as const,
      title: "Check-in reminder",
      message: `Your shift starts in ${minutes} minute${minutes === 1 ? "" : "s"}. Please check in.`,
      socketEvent: "checkin.reminder" as const
    };
  }
  return {
    type: "CHECKOUT_REMINDER" as const,
    title: "Checkout reminder",
    message: `Your shift ends in ${minutes} minute${minutes === 1 ? "" : "s"}. Please check out.`,
    socketEvent: "checkout.reminder" as const
  };
}

async function sendReminder(input: {
  userId: string;
  employeeId: string;
  workDate: Date;
  kind: "CHECK_IN" | "CHECK_OUT";
  relatedEntityType: string;
  relatedEntityId: string;
}) {
  const copy = reminderMessage(input.kind);
  const notification = await prisma.$transaction(async (tx) => {
    await tx.attendanceReminderLog.create({
      data: { employeeId: input.employeeId, workDate: input.workDate, kind: input.kind }
    });
    return tx.notification.create({
      data: {
        userId: input.userId,
        type: copy.type,
        title: copy.title,
        message: copy.message,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId
      }
    });
  });
  await deliverNotification(notification);
  emitToUser(input.userId, copy.socketEvent, {
    notificationId: notification.id,
    relatedEntityId: input.relatedEntityId
  });
}

async function processCheckoutReminders(now: Date): Promise<number> {
  const { windowStart, windowEnd } = reminderTargetWindow(
    now,
    env.ATTENDANCE_REMINDER_MINUTES,
    env.ATTENDANCE_REMINDER_SLACK_MINUTES
  );
  const candidates = await prisma.timesheet.findMany({
    where: {
      isOpen: true,
      actualCheckOut: null,
      scheduledCheckOut: { gte: windowStart, lte: windowEnd },
      employee: { status: "ACTIVE", user: { status: "ACTIVE" } }
    },
    include: { employee: { select: { id: true, userId: true } } }
  });
  let sent = 0;
  for (const timesheet of candidates) {
    const existing = await prisma.attendanceReminderLog.findUnique({
      where: {
        employeeId_workDate_kind: {
          employeeId: timesheet.employeeId,
          workDate: timesheet.workDate,
          kind: "CHECK_OUT"
        }
      }
    });
    if (existing) continue;
    try {
      await sendReminder({
        userId: timesheet.employee.userId,
        employeeId: timesheet.employeeId,
        workDate: timesheet.workDate,
        kind: "CHECK_OUT",
        relatedEntityType: "Timesheet",
        relatedEntityId: timesheet.id
      });
      sent++;
    } catch {
      // Unique constraint race: another cron run won; skip.
    }
  }
  return sent;
}

async function processCheckInReminders(now: Date): Promise<number> {
  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      office: { isActive: true },
      schedule: { isActive: true }
    },
    include: {
      user: { select: { id: true } },
      office: { select: { timezone: true } },
      schedule: { include: { days: true } }
    }
  });
  let sent = 0;
  for (const employee of employees) {
    if (!employee.office || !employee.schedule) continue;
    const daily = computeDailySchedule(employee.schedule, employee.office.timezone, now);
    if (!daily) continue;
    const { windowStart, windowEnd } = reminderTargetWindow(
      now,
      env.ATTENDANCE_REMINDER_MINUTES,
      env.ATTENDANCE_REMINDER_SLACK_MINUTES
    );
    if (daily.scheduledIn < windowStart || daily.scheduledIn > windowEnd) continue;

    const workDate = workDateFromKey(daily.workDate);
    const [timesheet, leave, existing] = await Promise.all([
      prisma.timesheet.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate } },
        select: { id: true }
      }),
      prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: "APPROVED",
          startDate: { lte: workDate },
          endDate: { gte: workDate }
        },
        select: { id: true }
      }),
      prisma.attendanceReminderLog.findUnique({
        where: {
          employeeId_workDate_kind: { employeeId: employee.id, workDate, kind: "CHECK_IN" }
        }
      })
    ]);
    if (timesheet || leave || existing) continue;
    try {
      await sendReminder({
        userId: employee.userId,
        employeeId: employee.id,
        workDate,
        kind: "CHECK_IN",
        relatedEntityType: "Employee",
        relatedEntityId: employee.id
      });
      sent++;
    } catch {
      // Unique constraint race: skip.
    }
  }
  return sent;
}

export const attendanceReminderService = {
  async run(now = new Date()): Promise<ReminderCounts> {
    const [checkOutSent, checkInSent] = await Promise.all([
      processCheckoutReminders(now),
      processCheckInReminders(now)
    ]);
    return { checkInSent, checkOutSent };
  }
};

export { reminderTargetWindow, isInReminderWindow, computeDailySchedule, dayRuleForWeekday, scheduledInstant } from "./attendance-schedule.js";
