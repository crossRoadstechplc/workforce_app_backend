import { DateTime } from "luxon";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { ROLE, assertSameOrganization } from "../../shared/tenancy.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";
import { formatWorkDateKey } from "../../shared/work-date.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToOrgAdmins, emitToUser } from "../../realtime/socket.server.js";
import { softwareEngineerTemplateItems, SOFTWARE_ENGINEER_TEMPLATE_NAME } from "./default-template.js";
import type { EvaluationItemSection, EvaluationStatus, Prisma } from "../../generated/prisma/client.js";

const PORTAL_ROLES = new Set([ROLE.ORG_ADMIN, ROLE.OFFICE_ADMIN, "ADMIN"]);
const SCORED_SECTIONS: EvaluationItemSection[] = ["METRIC", "RESPONSIBILITY"];
const employeePersonSelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  employeeCode: true,
  jobTitle: true,
  department: true,
  officeId: true,
  supervisorId: true,
  userId: true,
  office: { select: { id: true, name: true } }
} as const;

const evaluationInclude = {
  cycle: true,
  employee: {
    select: {
      ...employeePersonSelect,
      supervisor: { select: { id: true, firstName: true, middleName: true, lastName: true, jobTitle: true, userId: true } }
    }
  },
  scores: { orderBy: { sortOrder: "asc" as const } },
  goals: { orderBy: { sortOrder: "asc" as const } },
  evaluator: { select: { id: true, email: true } },
  finalizedBy: { select: { id: true, email: true } }
} as const;

type PeriodSnapshot = {
  attendanceDays: number;
  lateDays: number;
  lateMinutes: number;
  missingCheckoutDays: number;
  worksheetsSubmitted: number;
  approvedLeaveDays: number;
  overtimeMinutes: number;
  workedMinutes: number;
};

function inclusiveRange(from: Date, to: Date) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1));
  return { start, end };
}

function dateKey(d: Date) {
  return formatWorkDateKey(d);
}

function slugKey(section: string, label: string, index: number) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  return `${section.toLowerCase()}.${slug || `item_${index}`}`;
}

function average(values: Array<number | null | undefined>) {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function dec(value: number | null) {
  return value == null ? null : value;
}

function personName(p: { firstName: string; middleName?: string | null; lastName: string }) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

function cycleNumberPrefix(periodEnd: Date, override?: string | null) {
  if (override?.trim()) return override.trim().toUpperCase().replace(/\s+/g, "-").slice(0, 40);
  return DateTime.fromJSDate(periodEnd, { zone: "utc" }).toFormat("LLLL-dd-yyyy").toUpperCase();
}

async function employeeContext(userId: string) {
  const e = await prisma.employee.findUnique({
    where: { userId },
    include: { user: true, office: true, supervisor: { select: employeePersonSelect } }
  });
  if (!e || e.status !== "ACTIVE" || e.user.status !== "ACTIVE") {
    throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
  }
  return e;
}

async function orgAdminUserIds(organizationId: string) {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      memberships: { some: { organizationId } },
      userRoles: { some: { role: { name: { in: [ROLE.ORG_ADMIN, "ADMIN"] } } } }
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

async function officeAdminUserIds(officeId: string | null) {
  if (!officeId) return [];
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      adminOffices: { some: { officeId } },
      userRoles: { some: { role: { name: ROLE.OFFICE_ADMIN } } }
    },
    select: { id: true }
  });
  return users.map((x) => x.id);
}

async function reviewerUserIds(organizationId: string, officeId: string | null) {
  return [...new Set([...(await orgAdminUserIds(organizationId)), ...(await officeAdminUserIds(officeId))])];
}

function userHasPortalRole(roles: Array<{ role: { name: string } }>) {
  return roles.some((r) => PORTAL_ROLES.has(r.role.name));
}

async function assertNoSupervisorCycle(organizationId: string, employeeId: string, supervisorId: string) {
  if (employeeId === supervisorId) throw new AppError(422, "INVALID_SUPERVISOR", "An employee cannot supervise themselves");
  let current: string | null = supervisorId;
  const seen = new Set<string>([employeeId]);
  for (let i = 0; i < 20 && current; i++) {
    if (seen.has(current)) throw new AppError(422, "SUPERVISOR_CYCLE", "That supervisor assignment would create a reporting cycle");
    seen.add(current);
    const cursor: string = current;
    const row: { supervisorId: string | null } | null = await prisma.employee.findFirst({
      where: { id: cursor, organizationId },
      select: { supervisorId: true }
    });
    current = row?.supervisorId ?? null;
  }
}

export async function validateSupervisor(organizationId: string, employeeId: string | null, supervisorId: string | null | undefined) {
  if (supervisorId == null) return;
  const supervisor = await prisma.employee.findUnique({
    where: { id: supervisorId },
    include: { user: { include: { userRoles: { include: { role: true } } } } }
  });
  if (!supervisor || supervisor.organizationId !== organizationId) {
    throw new AppError(400, "INVALID_SUPERVISOR", "Supervisor must be an employee in this organization");
  }
  if (employeeId) await assertNoSupervisorCycle(organizationId, employeeId, supervisorId);
}

export function supervisorPortalAccess(supervisor: { user: { userRoles: Array<{ role: { name: string } }> } } | null | undefined) {
  if (!supervisor) return false;
  return userHasPortalRole(supervisor.user.userRoles);
}

async function periodSnapshot(employeeId: string, from: Date, to: Date): Promise<PeriodSnapshot> {
  const { start, end } = inclusiveRange(from, to);
  const [timesheets, worksheets, leaveRequests] = await prisma.$transaction([
    prisma.timesheet.findMany({ where: { employeeId, workDate: { gte: start, lt: end } } }),
    prisma.worksheet.findMany({ where: { employeeId, workDate: { gte: start, lt: end } }, select: { id: true } }),
    prisma.leaveRequest.findMany({
      where: { employeeId, startDate: { lt: end }, endDate: { gte: start }, status: "APPROVED" },
      select: { numberOfDays: true }
    })
  ]);
  const totals = timesheets.reduce(
    (a, x) => ({
      workedMinutes: a.workedMinutes + x.workedMinutes,
      lateMinutes: a.lateMinutes + x.lateMinutes,
      overtimeMinutes: a.overtimeMinutes + x.overtimeMinutes,
      lateDays: a.lateDays + (x.isLate ? 1 : 0),
      missingCheckoutDays: a.missingCheckoutDays + (x.isMissingCheckout ? 1 : 0)
    }),
    { workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, lateDays: 0, missingCheckoutDays: 0 }
  );
  return {
    attendanceDays: timesheets.length,
    lateDays: totals.lateDays,
    lateMinutes: totals.lateMinutes,
    missingCheckoutDays: totals.missingCheckoutDays,
    worksheetsSubmitted: worksheets.length,
    approvedLeaveDays: leaveRequests.reduce((n, x) => n + Number(x.numberOfDays), 0),
    overtimeMinutes: totals.overtimeMinutes,
    workedMinutes: totals.workedMinutes
  };
}

export async function ensureDefaultTemplate(organizationId: string) {
  const existing = await prisma.evaluationTemplate.findFirst({
    where: { organizationId, name: SOFTWARE_ENGINEER_TEMPLATE_NAME },
    include: { items: { orderBy: { sortOrder: "asc" } } }
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
    },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
}

async function pickTemplate(organizationId: string, jobTitle: string | null | undefined, templateId?: string | null) {
  if (templateId) {
    const t = await prisma.evaluationTemplate.findFirst({
      where: { id: templateId, organizationId, isActive: true },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
    if (!t) throw new AppError(400, "INVALID_TEMPLATE", "Template does not exist or is inactive");
    return t;
  }
  await ensureDefaultTemplate(organizationId);
  const templates = await prisma.evaluationTemplate.findMany({
    where: { organizationId, isActive: true },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  if (!templates.length) throw new AppError(400, "NO_TEMPLATE", "Create an evaluation template before opening a cycle");
  const title = (jobTitle ?? "").toLowerCase();
  const hinted = title
    ? templates.find((t) => t.jobTitleHint && title.includes(t.jobTitleHint.toLowerCase()))
    : undefined;
  return hinted ?? templates.find((t) => t.isDefault) ?? templates[0]!;
}

function serializeEvaluation(row: Prisma.EvaluationGetPayload<{ include: typeof evaluationInclude }>, opts: { hideEvaluator: boolean }) {
  const scores = row.scores.map((s) => ({
    id: s.id,
    itemKey: s.itemKey,
    section: s.section,
    label: s.label,
    sortOrder: s.sortOrder,
    selfScore: s.selfScore,
    evaluatorScore: opts.hideEvaluator ? null : s.evaluatorScore,
    evaluatorComment: opts.hideEvaluator ? null : s.evaluatorComment
  }));
  const goals = row.goals.map((g) => ({
    id: g.id,
    skill: g.skill,
    sortOrder: g.sortOrder,
    previousSelfScore: g.previousSelfScore,
    previousEvaluatorScore: opts.hideEvaluator ? null : g.previousEvaluatorScore,
    improvementSelfScore: g.improvementSelfScore,
    improvementEvaluatorScore: opts.hideEvaluator ? null : g.improvementEvaluatorScore,
    targetDate: g.targetDate ? dateKey(g.targetDate) : null,
    criteria: g.criteria
  }));
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    organizationId: row.organizationId,
    cycleId: row.cycleId,
    employeeId: row.employeeId,
    templateId: row.templateId,
    periodSnapshot: row.periodSnapshot,
    focusCompetency: opts.hideEvaluator ? null : row.focusCompetency,
    actionPlan: opts.hideEvaluator ? null : row.actionPlan,
    overallSelf: row.overallSelf == null ? null : Number(row.overallSelf),
    overallEvaluator: opts.hideEvaluator || row.overallEvaluator == null ? null : Number(row.overallEvaluator),
    selfSubmittedAt: row.selfSubmittedAt,
    evaluatorUserId: opts.hideEvaluator ? null : row.evaluatorUserId,
    evaluatorSubmittedAt: opts.hideEvaluator ? null : row.evaluatorSubmittedAt,
    finalizedAt: row.finalizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cycle: {
      id: row.cycle.id,
      name: row.cycle.name,
      status: row.cycle.status,
      periodStart: dateKey(row.cycle.periodStart),
      periodEnd: dateKey(row.cycle.periodEnd),
      selfDueAt: row.cycle.selfDueAt,
      evaluatorDueAt: row.cycle.evaluatorDueAt
    },
    employee: {
      ...row.employee,
      name: personName(row.employee),
      supervisor: row.employee.supervisor
        ? { ...row.employee.supervisor, name: personName(row.employee.supervisor) }
        : null
    },
    evaluator: opts.hideEvaluator ? null : row.evaluator,
    scores,
    goals
  };
}

function hideEvaluatorFor(status: EvaluationStatus, isAdmin: boolean) {
  if (isAdmin) return false;
  return status !== "EVALUATOR_SUBMITTED" && status !== "FINALIZED";
}

function computeAverages(scores: Array<{ section: EvaluationItemSection; selfScore: number | null; evaluatorScore: number | null }>) {
  const scored = scores.filter((s) => SCORED_SECTIONS.includes(s.section));
  return {
    overallSelf: average(scored.map((s) => s.selfScore)),
    overallEvaluator: average(scored.map((s) => s.evaluatorScore))
  };
}

async function nextEvaluationNumber(tx: Prisma.TransactionClient, organizationId: string, prefix: string) {
  const last = await tx.evaluation.findFirst({
    where: { organizationId, number: { startsWith: `${prefix}-` } },
    orderBy: { number: "desc" },
    select: { number: true }
  });
  const seq = last ? Number(last.number.slice(prefix.length + 1)) || 0 : 0;
  return `${prefix}-${String(seq + 1).padStart(3, "0")}`;
}

async function previousGoals(employeeId: string) {
  const prev = await prisma.evaluation.findFirst({
    where: { employeeId, status: "FINALIZED" },
    orderBy: { finalizedAt: "desc" },
    include: { goals: { orderBy: { sortOrder: "asc" } } }
  });
  return prev?.goals ?? [];
}

async function loadAdminEvaluation(organizationId: string, id: string, scope: OfficeScope) {
  const row = await prisma.evaluation.findFirst({ where: { id, organizationId }, include: evaluationInclude });
  if (!row) throw new AppError(404, "EVALUATION_NOT_FOUND", "Evaluation not found");
  assertOfficeInScope(scope, row.employee.officeId, "You do not manage this employee's office");
  return row;
}

export const performanceService = {
  async myList(userId: string, input: { page: number; pageSize: number; status?: EvaluationStatus }) {
    const e = await employeeContext(userId);
    const where = { employeeId: e.id, ...(input.status ? { status: input.status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.evaluation.findMany({
        where,
        include: evaluationInclude,
        orderBy: { createdAt: "desc" },
        ...pagination(input)
      }),
      prisma.evaluation.count({ where })
    ]);
    return {
      items: items.map((row) => serializeEvaluation(row, { hideEvaluator: hideEvaluatorFor(row.status, false) })),
      meta: pageMeta(input.page, input.pageSize, total)
    };
  },

  async myGet(userId: string, id: string) {
    const e = await employeeContext(userId);
    const row = await prisma.evaluation.findFirst({ where: { id, employeeId: e.id }, include: evaluationInclude });
    if (!row) throw new AppError(404, "EVALUATION_NOT_FOUND", "Evaluation not found");
    return serializeEvaluation(row, { hideEvaluator: hideEvaluatorFor(row.status, false) });
  },

  async employeeDraft(
    userId: string,
    id: string,
    input: {
      scores?: Array<{ itemKey: string; selfScore?: number | null }>;
      goals?: Array<{ id: string; improvementSelfScore?: number | null; targetDate?: Date | null; criteria?: string | null }>;
    }
  ) {
    const e = await employeeContext(userId);
    const current = await prisma.evaluation.findFirst({ where: { id, employeeId: e.id }, include: { cycle: true, scores: true, goals: true } });
    if (!current) throw new AppError(404, "EVALUATION_NOT_FOUND", "Evaluation not found");
    if (current.cycle.status !== "OPEN") throw new AppError(409, "CYCLE_NOT_OPEN", "This evaluation cycle is not open");
    if (!["OPEN", "SELF_DRAFT"].includes(current.status)) {
      throw new AppError(409, "SELF_LOCKED", "Self-scores are locked after submission");
    }
    const nextStatus: EvaluationStatus = current.status === "OPEN" ? "SELF_DRAFT" : current.status;
    const updated = await prisma.$transaction(async (tx) => {
      if (input.scores) {
        for (const s of input.scores) {
          await tx.evaluationScore.updateMany({
            where: { evaluationId: id, itemKey: s.itemKey, section: { in: SCORED_SECTIONS } },
            data: { selfScore: s.selfScore ?? null }
          });
        }
      }
      if (input.goals) {
        for (const g of input.goals) {
          await tx.evaluationGoal.updateMany({
            where: { id: g.id, evaluationId: id },
            data: {
              improvementSelfScore: g.improvementSelfScore ?? null,
              ...(g.targetDate !== undefined ? { targetDate: g.targetDate } : {}),
              ...(g.criteria !== undefined ? { criteria: g.criteria } : {})
            }
          });
        }
      }
      const scores = await tx.evaluationScore.findMany({ where: { evaluationId: id } });
      const avgs = computeAverages(scores);
      return tx.evaluation.update({
        where: { id },
        data: { status: nextStatus, overallSelf: dec(avgs.overallSelf) },
        include: evaluationInclude
      });
    });
    return serializeEvaluation(updated, { hideEvaluator: true });
  },

  async employeeSubmit(userId: string, id: string) {
    const e = await employeeContext(userId);
    const current = await prisma.evaluation.findFirst({
      where: { id, employeeId: e.id },
      include: { cycle: true, scores: true, goals: true, employee: { select: { firstName: true, lastName: true, officeId: true } } }
    });
    if (!current) throw new AppError(404, "EVALUATION_NOT_FOUND", "Evaluation not found");
    if (current.cycle.status !== "OPEN") throw new AppError(409, "CYCLE_NOT_OPEN", "This evaluation cycle is not open");
    if (!["OPEN", "SELF_DRAFT"].includes(current.status)) {
      throw new AppError(409, "SELF_LOCKED", "Self-scores are locked after submission");
    }
    const missing = current.scores.filter((s) => SCORED_SECTIONS.includes(s.section) && s.selfScore == null);
    if (missing.length) {
      throw new AppError(422, "INCOMPLETE_SELF_SCORES", "Score every metric and responsibility item from 1 to 10 before submitting", {
        missing: missing.map((s) => s.itemKey)
      });
    }
    const avgs = computeAverages(current.scores);
    const reviewers = await reviewerUserIds(current.organizationId, current.employee.officeId);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.evaluation.update({
        where: { id },
        data: { status: "SELF_SUBMITTED", selfSubmittedAt: new Date(), overallSelf: dec(avgs.overallSelf) },
        include: evaluationInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: "EVALUATION_SELF_SUBMITTED",
          entityType: "Evaluation",
          entityId: id,
          oldValues: auditJson({ status: current.status }),
          newValues: auditJson({ status: "SELF_SUBMITTED", overallSelf: avgs.overallSelf })
        }
      });
      const notifications = await Promise.all(
        reviewers.map((adminId) =>
          tx.notification.create({
            data: {
              userId: adminId,
              type: "EVALUATION_SELF_SUBMITTED",
              title: "Self-evaluation submitted",
              message: `${current.employee.firstName} ${current.employee.lastName} submitted a self-evaluation.`,
              relatedEntityType: "Evaluation",
              relatedEntityId: id
            }
          })
        )
      );
      return { updated, notifications };
    });
    for (const n of result.notifications) await deliverNotification(n);
    emitToOrgAdmins(current.organizationId, "evaluation.self_submitted", { evaluationId: id, employeeId: e.id });
    return serializeEvaluation(result.updated, { hideEvaluator: true });
  },

  async adminList(
    organizationId: string,
    userId: string,
    input: {
      page: number;
      pageSize: number;
      status?: EvaluationStatus;
      cycleId?: string;
      officeId?: string;
      employeeId?: string;
      search?: string;
      myReports?: boolean;
    },
    scope: OfficeScope
  ) {
    const me = input.myReports ? await prisma.employee.findUnique({ where: { userId }, select: { id: true } }) : null;
    const officePart = employeeOfficeFilter(scope, input.officeId);
    const where: Prisma.EvaluationWhereInput = {
      organizationId,
      ...(input.myReports && !me ? { id: "00000000-0000-0000-0000-000000000000" } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.cycleId ? { cycleId: input.cycleId } : {}),
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      employee: {
        ...officePart,
        ...(me ? { supervisorId: me.id } : {}),
        ...(input.search
          ? {
              OR: [
                { firstName: { contains: input.search, mode: "insensitive" } },
                { lastName: { contains: input.search, mode: "insensitive" } },
                { employeeCode: { contains: input.search, mode: "insensitive" } }
              ]
            }
          : {})
      }
    };
    const countWhere: Prisma.EvaluationWhereInput = {
      organizationId,
      employee: officePart
    };
    const now = new Date();
    const [items, total, awaitingSelf, awaitingEvaluator, done, overdue] = await prisma.$transaction([
      prisma.evaluation.findMany({
        where,
        include: evaluationInclude,
        orderBy: [{ createdAt: "desc" }],
        ...pagination(input)
      }),
      prisma.evaluation.count({ where }),
      prisma.evaluation.count({ where: { ...countWhere, status: { in: ["OPEN", "SELF_DRAFT"] } } }),
      prisma.evaluation.count({ where: { ...countWhere, status: { in: ["SELF_SUBMITTED", "EVALUATOR_DRAFT"] } } }),
      prisma.evaluation.count({ where: { ...countWhere, status: { in: ["EVALUATOR_SUBMITTED", "FINALIZED"] } } }),
      prisma.evaluation.count({
        where: {
          ...countWhere,
          status: { notIn: ["EVALUATOR_SUBMITTED", "FINALIZED"] },
          OR: [
            { status: { in: ["OPEN", "SELF_DRAFT"] }, cycle: { selfDueAt: { lt: now } } },
            { status: { in: ["SELF_SUBMITTED", "EVALUATOR_DRAFT"] }, cycle: { evaluatorDueAt: { lt: now } } }
          ]
        }
      })
    ]);
    return {
      items: items.map((row) => serializeEvaluation(row, { hideEvaluator: false })),
      meta: pageMeta(input.page, input.pageSize, total),
      counts: { awaitingSelf, awaitingEvaluator, done, overdue, total: awaitingSelf + awaitingEvaluator + done }
    };
  },

  async adminGet(organizationId: string, id: string, scope: OfficeScope) {
    const row = await loadAdminEvaluation(organizationId, id, scope);
    return serializeEvaluation(row, { hideEvaluator: false });
  },

  async evaluatorDraft(
    organizationId: string,
    userId: string,
    id: string,
    input: {
      scores?: Array<{ itemKey: string; evaluatorScore?: number | null; evaluatorComment?: string | null }>;
      goals?: Array<{ id: string; improvementEvaluatorScore?: number | null; targetDate?: Date | null; criteria?: string | null }>;
      focusCompetency?: string | null;
      actionPlan?: string | null;
    },
    scope: OfficeScope
  ) {
    const current = await loadAdminEvaluation(organizationId, id, scope);
    if (!["SELF_SUBMITTED", "EVALUATOR_DRAFT"].includes(current.status)) {
      throw new AppError(409, "NOT_READY_FOR_EVALUATOR", "Employee must submit self-scores before evaluator scoring");
    }
    if (current.cycle.status === "CLOSED") throw new AppError(409, "CYCLE_CLOSED", "This evaluation cycle is closed");
    const nextStatus: EvaluationStatus = current.status === "SELF_SUBMITTED" ? "EVALUATOR_DRAFT" : current.status;
    const updated = await prisma.$transaction(async (tx) => {
      if (input.scores) {
        for (const s of input.scores) {
          await tx.evaluationScore.updateMany({
            where: { evaluationId: id, itemKey: s.itemKey, section: { in: SCORED_SECTIONS } },
            data: {
              evaluatorScore: s.evaluatorScore ?? null,
              evaluatorComment: s.evaluatorComment ?? null
            }
          });
        }
      }
      if (input.goals) {
        for (const g of input.goals) {
          await tx.evaluationGoal.updateMany({
            where: { id: g.id, evaluationId: id },
            data: {
              improvementEvaluatorScore: g.improvementEvaluatorScore ?? null,
              ...(g.targetDate !== undefined ? { targetDate: g.targetDate } : {}),
              ...(g.criteria !== undefined ? { criteria: g.criteria } : {})
            }
          });
        }
      }
      const scores = await tx.evaluationScore.findMany({ where: { evaluationId: id } });
      const avgs = computeAverages(scores);
      return tx.evaluation.update({
        where: { id },
        data: {
          status: nextStatus,
          evaluatorUserId: userId,
          focusCompetency: input.focusCompetency !== undefined ? input.focusCompetency : current.focusCompetency,
          actionPlan: input.actionPlan !== undefined ? input.actionPlan : current.actionPlan,
          overallEvaluator: dec(avgs.overallEvaluator)
        },
        include: evaluationInclude
      });
    });
    return serializeEvaluation(updated, { hideEvaluator: false });
  },

  async evaluatorSubmit(organizationId: string, userId: string, id: string, audit: AuditContext, scope: OfficeScope) {
    const current = await loadAdminEvaluation(organizationId, id, scope);
    if (!["SELF_SUBMITTED", "EVALUATOR_DRAFT"].includes(current.status)) {
      throw new AppError(409, "NOT_READY_FOR_EVALUATOR", "Employee must submit self-scores before evaluator scoring");
    }
    const missing = current.scores.filter((s) => SCORED_SECTIONS.includes(s.section) && s.evaluatorScore == null);
    if (missing.length) {
      throw new AppError(422, "INCOMPLETE_EVALUATOR_SCORES", "Score every metric and responsibility item from 1 to 10", {
        missing: missing.map((s) => s.itemKey)
      });
    }
    const commentRequired = current.scores.filter((s) => {
      if (!SCORED_SECTIONS.includes(s.section) || s.evaluatorScore == null) return false;
      const gap = s.selfScore == null ? 0 : Math.abs(s.selfScore - s.evaluatorScore);
      return (s.evaluatorScore <= 4 || gap >= 3) && !s.evaluatorComment?.trim();
    });
    if (commentRequired.length) {
      throw new AppError(422, "COMMENT_REQUIRED", "Add a comment when the score is 4 or below, or the gap from self-score is 3 or more", {
        items: commentRequired.map((s) => s.itemKey)
      });
    }
    if (!current.focusCompetency?.trim() || !current.actionPlan?.trim()) {
      throw new AppError(422, "NARRATIVE_REQUIRED", "Focus competency and action plan are required before submitting");
    }
    const avgs = computeAverages(current.scores);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.evaluation.update({
        where: { id },
        data: {
          status: "EVALUATOR_SUBMITTED",
          evaluatorUserId: userId,
          evaluatorSubmittedAt: new Date(),
          overallEvaluator: dec(avgs.overallEvaluator)
        },
        include: evaluationInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EVALUATION_SCORED",
          entityType: "Evaluation",
          entityId: id,
          oldValues: auditJson({ status: current.status }),
          newValues: auditJson({ status: "EVALUATOR_SUBMITTED", overallEvaluator: avgs.overallEvaluator }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.employee.userId,
          type: "EVALUATION_SCORED",
          title: "Performance evaluation scored",
          message: `Your ${current.cycle.name} evaluation has been scored by your reviewer.`,
          relatedEntityType: "Evaluation",
          relatedEntityId: id
        }
      });
      return { updated, n };
    });
    await deliverNotification(result.n);
    emitToUser(current.employee.userId, "evaluation.scored", { evaluationId: id });
    return serializeEvaluation(result.updated, { hideEvaluator: false });
  },

  async finalize(organizationId: string, userId: string, id: string, audit: AuditContext, scope: OfficeScope) {
    const current = await loadAdminEvaluation(organizationId, id, scope);
    if (current.status !== "EVALUATOR_SUBMITTED" && current.status !== "FINALIZED") {
      throw new AppError(409, "NOT_READY_TO_FINALIZE", "Evaluator must submit scores before finalizing");
    }
    if (current.status === "FINALIZED") return serializeEvaluation(current, { hideEvaluator: false });
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.evaluation.update({
        where: { id },
        data: { status: "FINALIZED", finalizedAt: new Date(), finalizedByUserId: userId },
        include: evaluationInclude
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EVALUATION_FINALIZED",
          entityType: "Evaluation",
          entityId: id,
          oldValues: auditJson({ status: current.status }),
          newValues: auditJson({ status: "FINALIZED" }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      const n = await tx.notification.create({
        data: {
          userId: current.employee.userId,
          type: "EVALUATION_FINALIZED",
          title: "Performance evaluation finalized",
          message: `Your ${current.cycle.name} evaluation is complete.`,
          relatedEntityType: "Evaluation",
          relatedEntityId: id
        }
      });
      return { updated, n };
    });
    await deliverNotification(result.n);
    emitToUser(current.employee.userId, "evaluation.finalized", { evaluationId: id });
    return serializeEvaluation(result.updated, { hideEvaluator: false });
  },

  async listCycles(organizationId: string, input: { page: number; pageSize: number; status?: "DRAFT" | "OPEN" | "CLOSED" }) {
    const where = { organizationId, ...(input.status ? { status: input.status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.evaluationCycle.findMany({
        where,
        include: { _count: { select: { evaluations: true } } },
        orderBy: { createdAt: "desc" },
        ...pagination(input)
      }),
      prisma.evaluationCycle.count({ where })
    ]);
    const withCounts = await Promise.all(
      items.map(async (c) => {
        const [awaitingSelf, awaitingEvaluator, done] = await Promise.all([
          prisma.evaluation.count({ where: { cycleId: c.id, status: { in: ["OPEN", "SELF_DRAFT"] } } }),
          prisma.evaluation.count({ where: { cycleId: c.id, status: { in: ["SELF_SUBMITTED", "EVALUATOR_DRAFT"] } } }),
          prisma.evaluation.count({ where: { cycleId: c.id, status: { in: ["EVALUATOR_SUBMITTED", "FINALIZED"] } } })
        ]);
        return {
          ...c,
          periodStart: dateKey(c.periodStart),
          periodEnd: dateKey(c.periodEnd),
          counts: { total: c._count.evaluations, awaitingSelf, awaitingEvaluator, done }
        };
      })
    );
    return { items: withCounts, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async getCycle(organizationId: string, id: string) {
    const cycle = await prisma.evaluationCycle.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { evaluations: true } } }
    });
    if (!cycle) throw new AppError(404, "CYCLE_NOT_FOUND", "Evaluation cycle not found");
    return { ...cycle, periodStart: dateKey(cycle.periodStart), periodEnd: dateKey(cycle.periodEnd) };
  },

  async createCycle(
    organizationId: string,
    userId: string,
    input: {
      name: string;
      periodStart: Date;
      periodEnd: Date;
      selfDueAt?: Date | null;
      evaluatorDueAt?: Date | null;
      numberPrefix?: string | null;
      officeId?: string | null;
      employeeIds?: string[];
      allActive?: boolean;
      templateId?: string | null;
      open?: boolean;
    },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    if (input.officeId) assertOfficeInScope(scope, input.officeId);
    const cycle = await prisma.evaluationCycle.create({
      data: {
        organizationId,
        name: input.name,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        selfDueAt: input.selfDueAt ?? null,
        evaluatorDueAt: input.evaluatorDueAt ?? null,
        numberPrefix: input.numberPrefix ?? cycleNumberPrefix(input.periodEnd, input.numberPrefix),
        createdByUserId: userId,
        status: "DRAFT"
      }
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "EVALUATION_CYCLE_CREATED",
        entityType: "EvaluationCycle",
        entityId: cycle.id,
        newValues: auditJson({ name: cycle.name, periodStart: dateKey(cycle.periodStart), periodEnd: dateKey(cycle.periodEnd) }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    if (input.open) {
      return this.openCycle(organizationId, cycle.id, { officeId: input.officeId, employeeIds: input.employeeIds, allActive: input.allActive, templateId: input.templateId }, audit, scope);
    }
    return { ...cycle, periodStart: dateKey(cycle.periodStart), periodEnd: dateKey(cycle.periodEnd) };
  },

  async openCycle(
    organizationId: string,
    cycleId: string,
    input: { officeId?: string | null; employeeIds?: string[]; allActive?: boolean; templateId?: string | null },
    audit: AuditContext,
    scope: OfficeScope
  ) {
    const cycle = await prisma.evaluationCycle.findFirst({ where: { id: cycleId, organizationId } });
    if (!cycle) throw new AppError(404, "CYCLE_NOT_FOUND", "Evaluation cycle not found");
    if (cycle.status === "CLOSED") throw new AppError(409, "CYCLE_CLOSED", "A closed cycle cannot be reopened");
    if (input.officeId) assertOfficeInScope(scope, input.officeId);

    const officePart = employeeOfficeFilter(scope, input.officeId ?? undefined);
    const employeeWhere: Prisma.EmployeeWhereInput = {
      organizationId,
      status: "ACTIVE",
      ...officePart,
      ...(input.employeeIds?.length ? { id: { in: input.employeeIds } } : {})
    };
    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true, userId: true, firstName: true, lastName: true, jobTitle: true, officeId: true }
    });
    if (!employees.length) throw new AppError(422, "NO_EMPLOYEES", "No active employees match this cycle");

    await ensureDefaultTemplate(organizationId);
    const prefix = cycle.numberPrefix || cycleNumberPrefix(cycle.periodEnd);
    const createdIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      if (cycle.status === "DRAFT") {
        await tx.evaluationCycle.update({
          where: { id: cycleId },
          data: { status: "OPEN", openedAt: new Date() }
        });
      }
      for (const emp of employees) {
        const exists = await tx.evaluation.findUnique({ where: { cycleId_employeeId: { cycleId, employeeId: emp.id } } });
        if (exists) continue;
        const template = await pickTemplate(organizationId, emp.jobTitle, input.templateId);
        const snapshot = await periodSnapshot(emp.id, cycle.periodStart, cycle.periodEnd);
        const prevGoals = await previousGoals(emp.id);
        const number = await nextEvaluationNumber(tx, organizationId, prefix);
        const scoreItems = template.items.filter((i) => SCORED_SECTIONS.includes(i.section));
        const skillItems = template.items.filter((i) => i.section === "SKILL_IMPROVED" || i.section === "GOAL");
        const goalLabels = new Map<string, { label: string; sortOrder: number }>();
        for (const item of skillItems) {
          const key = item.label.trim().toLowerCase();
          if (!goalLabels.has(key)) goalLabels.set(key, { label: item.label, sortOrder: item.sortOrder });
        }
        const evaluation = await tx.evaluation.create({
          data: {
            organizationId,
            cycleId,
            employeeId: emp.id,
            templateId: template.id,
            number,
            status: "OPEN",
            templateSnapshot: template.items.map((i) => ({ itemKey: i.itemKey, section: i.section, label: i.label, sortOrder: i.sortOrder })),
            periodSnapshot: snapshot,
            scores: {
              create: scoreItems.map((i) => ({
                itemKey: i.itemKey,
                section: i.section,
                label: i.label,
                sortOrder: i.sortOrder
              }))
            }
          }
        });
        const goalRows = [...goalLabels.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        const sourceGoals = prevGoals.length
          ? prevGoals.map((g, i) => ({
              skill: g.skill,
              sortOrder: i,
              previousSelfScore: g.improvementSelfScore,
              previousEvaluatorScore: g.improvementEvaluatorScore,
              targetDate: null as Date | null,
              criteria: g.criteria
            }))
          : goalRows.map((g, i) => ({
              skill: g.label,
              sortOrder: i,
              previousSelfScore: null as number | null,
              previousEvaluatorScore: null as number | null,
              targetDate: null as Date | null,
              criteria: null as string | null
            }));
        if (sourceGoals.length) {
          await tx.evaluationGoal.createMany({
            data: sourceGoals.map((g) => ({
              evaluationId: evaluation.id,
              skill: g.skill,
              sortOrder: g.sortOrder,
              previousSelfScore: g.previousSelfScore,
              previousEvaluatorScore: g.previousEvaluatorScore,
              targetDate: g.targetDate,
              criteria: g.criteria
            }))
          });
        }
        createdIds.push(evaluation.id);
        await tx.notification.create({
          data: {
            userId: emp.userId,
            type: "EVALUATION_OPENED",
            title: "Performance evaluation opened",
            message: `Complete your ${cycle.name} self-evaluation.`,
            relatedEntityType: "Evaluation",
            relatedEntityId: evaluation.id
          }
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "EVALUATION_CYCLE_OPENED",
          entityType: "EvaluationCycle",
          entityId: cycleId,
          newValues: auditJson({ created: createdIds.length }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    });

    const notifications = await prisma.notification.findMany({
      where: { relatedEntityType: "Evaluation", relatedEntityId: { in: createdIds }, type: "EVALUATION_OPENED" }
    });
    for (const n of notifications) {
      await deliverNotification(n);
      if (n.userId) emitToUser(n.userId, "evaluation.opened", { evaluationId: n.relatedEntityId });
    }
    emitToOrgAdmins(organizationId, "evaluation.opened", { cycleId, created: createdIds.length });
    return this.getCycle(organizationId, cycleId);
  },

  async closeCycle(organizationId: string, cycleId: string, audit: AuditContext) {
    const cycle = await prisma.evaluationCycle.findFirst({ where: { id: cycleId, organizationId } });
    if (!cycle) throw new AppError(404, "CYCLE_NOT_FOUND", "Evaluation cycle not found");
    const updated = await prisma.evaluationCycle.update({
      where: { id: cycleId },
      data: { status: "CLOSED", closedAt: new Date() }
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "EVALUATION_CYCLE_CLOSED",
        entityType: "EvaluationCycle",
        entityId: cycleId,
        oldValues: auditJson({ status: cycle.status }),
        newValues: auditJson({ status: "CLOSED" }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return { ...updated, periodStart: dateKey(updated.periodStart), periodEnd: dateKey(updated.periodEnd) };
  },

  async exportCycle(organizationId: string, cycleId: string, scope: OfficeScope) {
    const cycle = await prisma.evaluationCycle.findFirst({ where: { id: cycleId, organizationId } });
    if (!cycle) throw new AppError(404, "CYCLE_NOT_FOUND", "Evaluation cycle not found");
    const officePart = employeeOfficeFilter(scope);
    const rows = await prisma.evaluation.findMany({
      where: { cycleId, organizationId, employee: officePart },
      include: evaluationInclude,
      orderBy: { number: "asc" }
    });
    return rows.map((row) => {
      const serialized = serializeEvaluation(row, { hideEvaluator: false });
      const scoreCols = Object.fromEntries(serialized.scores.map((s) => [`${s.label} (self)`, s.selfScore]));
      const evalCols = Object.fromEntries(serialized.scores.map((s) => [`${s.label} (evaluator)`, s.evaluatorScore]));
      return {
        number: serialized.number,
        employee: serialized.employee.name,
        employeeCode: serialized.employee.employeeCode,
        jobTitle: serialized.employee.jobTitle ?? "",
        office: serialized.employee.office?.name ?? "",
        supervisor: serialized.employee.supervisor?.name ?? "",
        status: serialized.status,
        overallSelf: serialized.overallSelf,
        overallEvaluator: serialized.overallEvaluator,
        focusCompetency: serialized.focusCompetency ?? "",
        actionPlan: serialized.actionPlan ?? "",
        ...scoreCols,
        ...evalCols
      };
    });
  },

  async listTemplates(organizationId: string) {
    await ensureDefaultTemplate(organizationId);
    return prisma.evaluationTemplate.findMany({
      where: { organizationId },
      include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { evaluations: true } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }]
    });
  },

  async getTemplate(organizationId: string, id: string) {
    const t = await prisma.evaluationTemplate.findFirst({
      where: { id, organizationId },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
    if (!t) throw new AppError(404, "TEMPLATE_NOT_FOUND", "Template not found");
    return t;
  },

  async createTemplate(
    organizationId: string,
    input: {
      name: string;
      description?: string | null;
      jobTitleHint?: string | null;
      isDefault?: boolean;
      items: Array<{ section: EvaluationItemSection; itemKey?: string; label: string; sortOrder: number }>;
    }
  ) {
    if (input.isDefault) {
      await prisma.evaluationTemplate.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } });
    }
    return prisma.evaluationTemplate.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        jobTitleHint: input.jobTitleHint ?? null,
        isDefault: input.isDefault ?? false,
        items: {
          create: input.items.map((item, i) => ({
            section: item.section,
            itemKey: item.itemKey?.trim() || slugKey(item.section, item.label, i),
            label: item.label,
            sortOrder: item.sortOrder
          }))
        }
      },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
  },

  async updateTemplate(
    organizationId: string,
    id: string,
    input: {
      name?: string;
      description?: string | null;
      jobTitleHint?: string | null;
      isDefault?: boolean;
      isActive?: boolean;
      items?: Array<{ section: EvaluationItemSection; itemKey?: string; label: string; sortOrder: number }>;
    }
  ) {
    await this.getTemplate(organizationId, id);
    if (input.isDefault) {
      await prisma.evaluationTemplate.updateMany({ where: { organizationId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
    }
    return prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.evaluationTemplateItem.deleteMany({ where: { templateId: id } });
        await tx.evaluationTemplateItem.createMany({
          data: input.items.map((item, i) => ({
            templateId: id,
            section: item.section,
            itemKey: item.itemKey?.trim() || slugKey(item.section, item.label, i),
            label: item.label,
            sortOrder: item.sortOrder
          }))
        });
      }
      return tx.evaluationTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.jobTitleHint !== undefined ? { jobTitleHint: input.jobTitleHint } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
        },
        include: { items: { orderBy: { sortOrder: "asc" } } }
      });
    });
  }
};
