import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { assertSameOrganization } from "../../shared/tenancy.js";
import { env } from "../../config/env.js";
import { decryptSecret, encryptSecret, maskSecret, verifyVaultPin } from "./vault-crypto.js";
import { signVaultToken, type VaultScope } from "./vault-token.js";

const UNLOCK_WINDOW_MS = 15 * 60_000;
const UNLOCK_MAX_ATTEMPTS = 5;
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();

type CredentialInput = {
  title: string;
  type: "EMAIL" | "PASSWORD" | "WIFI" | "BANK" | "SOFTWARE" | "API_KEY" | "OTHER";
  officeId?: string | null;
  username?: string | null;
  email?: string | null;
  url?: string | null;
  notes?: string | null;
  secret?: string;
};

type SubscriptionInput = {
  name: string;
  vendor?: string | null;
  category?: string | null;
  status?: "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";
  billingCycle: "MONTHLY" | "YEARLY";
  seats: number;
  unitAmount: number;
  currency: string;
  startDate: string;
  endDate?: string | null;
  renewalDay?: number | null;
  notes?: string | null;
  officeId?: string | null;
  loginCredentialId?: string | null;
  fromYearMonth?: string;
};

function blankToNull(value?: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function money(value: Prisma.Decimal | string | number) {
  return typeof value === "number" ? value.toFixed(2) : value.toString();
}

function currentYearMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function yearMonthToDate(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1));
}

function dateToYearMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(yearMonth: string, count: number) {
  const date = yearMonthToDate(yearMonth);
  date.setUTCMonth(date.getUTCMonth() + count);
  return dateToYearMonth(date);
}

function monthsInRange(start: string, end: string) {
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
    if (months.length > 120) break;
  }
  return months;
}

function periodAmount(seats: number, unitAmount: number, cycle: "MONTHLY" | "YEARLY") {
  const raw = cycle === "YEARLY" ? (seats * unitAmount) / 12 : seats * unitAmount;
  return new Prisma.Decimal(raw.toFixed(2));
}

function publicCredential(row: {
  id: string;
  organizationId: string;
  officeId: string | null;
  title: string;
  type: string;
  username: string | null;
  email: string | null;
  url: string | null;
  notes: string | null;
  secretEncrypted: string;
  lastRevealedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  office?: { id: string; name: string } | null;
}) {
  const masked = maskSecret(decryptSecret(row.secretEncrypted));
  return {
    id: row.id,
    officeId: row.officeId,
    officeName: row.office?.name ?? null,
    title: row.title,
    type: row.type,
    username: row.username,
    email: row.email,
    url: row.url,
    notes: row.notes,
    lastRevealedAt: row.lastRevealedAt,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...masked
  };
}

function publicPeriod(row: { id: string; yearMonth: string; seats: number; amount: Prisma.Decimal; paid: boolean; paidAt: Date | null; notes: string | null }) {
  return {
    id: row.id,
    yearMonth: row.yearMonth,
    seats: row.seats,
    amount: money(row.amount),
    paid: row.paid,
    paidAt: row.paidAt,
    notes: row.notes
  };
}

function publicSubscription(row: {
  id: string;
  officeId: string | null;
  name: string;
  vendor: string | null;
  category: string | null;
  status: string;
  billingCycle: "MONTHLY" | "YEARLY";
  seats: number;
  unitAmount: Prisma.Decimal;
  currency: string;
  startDate: Date;
  endDate: Date | null;
  renewalDay: number | null;
  notes: string | null;
  loginCredentialId: string | null;
  createdAt: Date;
  updatedAt: Date;
  office?: { id: string; name: string } | null;
  loginCredential?: { id: string; title: string } | null;
  periods?: Array<{ id: string; yearMonth: string; seats: number; amount: Prisma.Decimal; paid: boolean; paidAt: Date | null; notes: string | null }>;
}) {
  const thisMonth = currentYearMonth();
  const currentPeriod = row.periods?.find((p) => p.yearMonth === thisMonth);
  return {
    id: row.id,
    officeId: row.officeId,
    officeName: row.office?.name ?? null,
    name: row.name,
    vendor: row.vendor,
    category: row.category,
    status: row.status,
    billingCycle: row.billingCycle,
    seats: row.seats,
    unitAmount: money(row.unitAmount),
    currency: row.currency,
    startDate: row.startDate,
    endDate: row.endDate,
    renewalDay: row.renewalDay,
    notes: row.notes,
    loginCredentialId: row.loginCredentialId,
    loginCredentialTitle: row.loginCredential?.title ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currentMonthSeats: currentPeriod?.seats ?? row.seats,
    currentMonthAmount: currentPeriod ? money(currentPeriod.amount) : money(periodAmount(row.seats, Number(row.unitAmount), row.billingCycle)),
    periods: (row.periods ?? []).map(publicPeriod)
  };
}

async function assertOffice(organizationId: string, officeId?: string | null) {
  if (!officeId) return;
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true, organizationId: true } });
  if (!office) throw new AppError(404, "OFFICE_NOT_FOUND", "Office not found");
  assertSameOrganization(office.organizationId, organizationId, "OFFICE_NOT_FOUND", "Office not found");
}

async function assertCredentialLink(organizationId: string, credentialId?: string | null) {
  if (!credentialId) return;
  const credential = await prisma.vaultCredential.findUnique({ where: { id: credentialId }, select: { id: true, organizationId: true } });
  if (!credential) throw new AppError(404, "VAULT_CREDENTIAL_NOT_FOUND", "Linked credential not found");
  assertSameOrganization(credential.organizationId, organizationId, "VAULT_CREDENTIAL_NOT_FOUND", "Linked credential not found");
}

function rangeEndYearMonth(startDate: string, endDate?: string | null) {
  const start = startDate.slice(0, 7);
  if (endDate) return endDate.slice(0, 7);
  return addMonths(start, 23);
}

async function syncPeriods(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  input: { startDate: string; endDate?: string | null; seats: number; unitAmount: number; billingCycle: "MONTHLY" | "YEARLY" },
  fromYearMonth?: string
) {
  const start = input.startDate.slice(0, 7);
  const end = rangeEndYearMonth(input.startDate, input.endDate);
  const months = monthsInRange(start, end);
  const rewriteFrom = fromYearMonth && fromYearMonth >= start ? fromYearMonth : start;
  const nowMonth = currentYearMonth();
  const frozenBefore = fromYearMonth ? rewriteFrom : nowMonth;

  const existing = await tx.subscriptionPeriod.findMany({ where: { subscriptionId } });
  const existingByMonth = new Map(existing.map((row) => [row.yearMonth, row]));

  for (const yearMonth of months) {
    const shouldRewrite = yearMonth >= frozenBefore;
    const amount = periodAmount(input.seats, input.unitAmount, input.billingCycle);
    const current = existingByMonth.get(yearMonth);
    if (!current) {
      await tx.subscriptionPeriod.create({
        data: { subscriptionId, yearMonth, seats: input.seats, amount }
      });
      continue;
    }
    if (!shouldRewrite) continue;
    await tx.subscriptionPeriod.update({
      where: { id: current.id },
      data: { seats: input.seats, amount }
    });
  }

  await tx.subscriptionPeriod.deleteMany({
    where: { subscriptionId, yearMonth: { notIn: months } }
  });
}

function checkUnlockRate(userId: string) {
  const now = Date.now();
  const current = unlockAttempts.get(userId);
  if (!current || current.resetAt <= now) {
    unlockAttempts.set(userId, { count: 0, resetAt: now + UNLOCK_WINDOW_MS });
    return;
  }
  if (current.count >= UNLOCK_MAX_ATTEMPTS) {
    throw new AppError(429, "VAULT_UNLOCK_LOCKED", "Too many vault PIN attempts. Try again in 15 minutes.");
  }
}

function recordUnlockFailure(userId: string) {
  const now = Date.now();
  const current = unlockAttempts.get(userId) ?? { count: 0, resetAt: now + UNLOCK_WINDOW_MS };
  if (current.resetAt <= now) {
    unlockAttempts.set(userId, { count: 1, resetAt: now + UNLOCK_WINDOW_MS });
    return;
  }
  current.count += 1;
  unlockAttempts.set(userId, current);
}

export const vaultService = {
  async unlock(userId: string, organizationId: string, pin: string, scope: VaultScope) {
    checkUnlockRate(userId);
    const ok = await verifyVaultPin(scope, pin);
    if (!ok) {
      recordUnlockFailure(userId);
      throw new AppError(401, "VAULT_PIN_INVALID", "Vault PIN is incorrect");
    }
    unlockAttempts.delete(userId);
    const vaultToken = await signVaultToken({ userId, organizationId, scope });
    return { vaultToken, scope, expiresIn: env.VAULT_TOKEN_TTL_MINUTES * 60 };
  },

  async listCredentials(
    organizationId: string,
    input: { page: number; pageSize: number; search?: string; type?: CredentialInput["type"]; officeId?: string }
  ) {
    const where: Prisma.VaultCredentialWhereInput = {
      organizationId,
      ...(input.type ? { type: input.type } : {}),
      ...(input.officeId ? { officeId: input.officeId } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { username: { contains: input.search, mode: "insensitive" } },
              { email: { contains: input.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.vaultCredential.findMany({
        where,
        orderBy: { title: "asc" },
        ...pagination(input),
        include: { office: { select: { id: true, name: true } } }
      }),
      prisma.vaultCredential.count({ where })
    ]);
    return { items: items.map(publicCredential), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async createCredential(organizationId: string, actorUserId: string, input: CredentialInput, audit: AuditContext) {
    await assertOffice(organizationId, input.officeId);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.vaultCredential.create({
        data: {
          organizationId,
          createdById: actorUserId,
          title: input.title,
          type: input.type,
          officeId: input.officeId ?? null,
          username: blankToNull(input.username),
          email: blankToNull(input.email),
          url: blankToNull(input.url),
          notes: blankToNull(input.notes),
          secretEncrypted: encryptSecret(input.secret ?? "")
        },
        include: { office: { select: { id: true, name: true } } }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_CREDENTIAL_CREATED",
          entityType: "VaultCredential",
          entityId: row.id,
          newValues: auditJson({ title: row.title, type: row.type, officeId: row.officeId, email: row.email }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return row;
    });
    return publicCredential(created);
  },

  async updateCredential(organizationId: string, id: string, input: Partial<CredentialInput>, audit: AuditContext) {
    const current = await prisma.vaultCredential.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "VAULT_CREDENTIAL_NOT_FOUND", "Credential not found");
    assertSameOrganization(current.organizationId, organizationId, "VAULT_CREDENTIAL_NOT_FOUND", "Credential not found");
    if (input.officeId !== undefined) await assertOffice(organizationId, input.officeId);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vaultCredential.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.officeId !== undefined ? { officeId: input.officeId } : {}),
          ...(input.username !== undefined ? { username: blankToNull(input.username) } : {}),
          ...(input.email !== undefined ? { email: blankToNull(input.email) } : {}),
          ...(input.url !== undefined ? { url: blankToNull(input.url) } : {}),
          ...(input.notes !== undefined ? { notes: blankToNull(input.notes) } : {}),
          ...(input.secret ? { secretEncrypted: encryptSecret(input.secret) } : {})
        },
        include: { office: { select: { id: true, name: true } } }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_CREDENTIAL_UPDATED",
          entityType: "VaultCredential",
          entityId: id,
          oldValues: auditJson({ title: current.title, type: current.type, officeId: current.officeId, email: current.email }),
          newValues: auditJson({ title: row.title, type: row.type, officeId: row.officeId, email: row.email, secretRotated: Boolean(input.secret) }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return row;
    });
    return publicCredential(updated);
  },

  async deleteCredential(organizationId: string, id: string, audit: AuditContext) {
    const current = await prisma.vaultCredential.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "VAULT_CREDENTIAL_NOT_FOUND", "Credential not found");
    assertSameOrganization(current.organizationId, organizationId, "VAULT_CREDENTIAL_NOT_FOUND", "Credential not found");
    await prisma.$transaction(async (tx) => {
      await tx.vaultCredential.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_CREDENTIAL_DELETED",
          entityType: "VaultCredential",
          entityId: id,
          oldValues: auditJson({ title: current.title, type: current.type }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    });
  },

  async revealCredential(organizationId: string, id: string, audit: AuditContext) {
    const current = await prisma.vaultCredential.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "VAULT_CREDENTIAL_NOT_FOUND", "Credential not found");
    assertSameOrganization(current.organizationId, organizationId, "VAULT_CREDENTIAL_NOT_FOUND", "Credential not found");
    const secret = decryptSecret(current.secretEncrypted);
    await prisma.$transaction(async (tx) => {
      await tx.vaultCredential.update({ where: { id }, data: { lastRevealedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_CREDENTIAL_REVEALED",
          entityType: "VaultCredential",
          entityId: id,
          newValues: auditJson({ title: current.title }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    });
    return { id: current.id, secret };
  },

  async listSubscriptions(
    organizationId: string,
    input: { page: number; pageSize: number; search?: string; status?: SubscriptionInput["status"]; officeId?: string }
  ) {
    const where: Prisma.OfficeSubscriptionWhereInput = {
      organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.officeId ? { officeId: input.officeId } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { vendor: { contains: input.search, mode: "insensitive" } },
              { category: { contains: input.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.officeSubscription.findMany({
        where,
        orderBy: { name: "asc" },
        ...pagination(input),
        include: {
          office: { select: { id: true, name: true } },
          loginCredential: { select: { id: true, title: true } },
          periods: { orderBy: { yearMonth: "asc" } }
        }
      }),
      prisma.officeSubscription.count({ where })
    ]);
    return { items: items.map(publicSubscription), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async createSubscription(organizationId: string, input: SubscriptionInput, audit: AuditContext) {
    await assertOffice(organizationId, input.officeId);
    await assertCredentialLink(organizationId, input.loginCredentialId);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.officeSubscription.create({
        data: {
          organizationId,
          name: input.name,
          vendor: blankToNull(input.vendor),
          category: blankToNull(input.category),
          status: input.status ?? "ACTIVE",
          billingCycle: input.billingCycle,
          seats: input.seats,
          unitAmount: new Prisma.Decimal(input.unitAmount.toFixed(2)),
          currency: input.currency.toUpperCase(),
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
          renewalDay: input.renewalDay ?? null,
          notes: blankToNull(input.notes),
          officeId: input.officeId ?? null,
          loginCredentialId: input.loginCredentialId ?? null
        }
      });
      await syncPeriods(
        tx,
        row.id,
        {
          startDate: input.startDate,
          endDate: input.endDate,
          seats: input.seats,
          unitAmount: input.unitAmount,
          billingCycle: input.billingCycle
        },
        input.startDate.slice(0, 7)
      );
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_SUBSCRIPTION_CREATED",
          entityType: "OfficeSubscription",
          entityId: row.id,
          newValues: auditJson({ name: row.name, seats: row.seats, unitAmount: money(row.unitAmount), startDate: input.startDate, endDate: input.endDate ?? null }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return tx.officeSubscription.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          office: { select: { id: true, name: true } },
          loginCredential: { select: { id: true, title: true } },
          periods: { orderBy: { yearMonth: "asc" } }
        }
      });
    });
    return publicSubscription(created);
  },

  async updateSubscription(organizationId: string, id: string, input: Partial<SubscriptionInput>, audit: AuditContext) {
    const current = await prisma.officeSubscription.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "VAULT_SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    assertSameOrganization(current.organizationId, organizationId, "VAULT_SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    if (input.officeId !== undefined) await assertOffice(organizationId, input.officeId);
    if (input.loginCredentialId !== undefined) await assertCredentialLink(organizationId, input.loginCredentialId);

    const nextSeats = input.seats ?? current.seats;
    const nextUnit = input.unitAmount ?? Number(current.unitAmount);
    const nextCycle = input.billingCycle ?? current.billingCycle;
    const nextStart = input.startDate ?? current.startDate.toISOString().slice(0, 10);
    const nextEnd = input.endDate !== undefined ? input.endDate : current.endDate?.toISOString().slice(0, 10) ?? null;
    const rewriteFrom = input.fromYearMonth ?? (input.seats !== undefined || input.unitAmount !== undefined || input.billingCycle !== undefined ? currentYearMonth() : nextStart);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.officeSubscription.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.vendor !== undefined ? { vendor: blankToNull(input.vendor) } : {}),
          ...(input.category !== undefined ? { category: blankToNull(input.category) } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.billingCycle !== undefined ? { billingCycle: input.billingCycle } : {}),
          ...(input.seats !== undefined ? { seats: input.seats } : {}),
          ...(input.unitAmount !== undefined ? { unitAmount: new Prisma.Decimal(input.unitAmount.toFixed(2)) } : {}),
          ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
          ...(input.startDate !== undefined ? { startDate: new Date(`${input.startDate}T00:00:00.000Z`) } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null } : {}),
          ...(input.renewalDay !== undefined ? { renewalDay: input.renewalDay } : {}),
          ...(input.notes !== undefined ? { notes: blankToNull(input.notes) } : {}),
          ...(input.officeId !== undefined ? { officeId: input.officeId } : {}),
          ...(input.loginCredentialId !== undefined ? { loginCredentialId: input.loginCredentialId } : {})
        }
      });
      if (
        input.seats !== undefined ||
        input.unitAmount !== undefined ||
        input.billingCycle !== undefined ||
        input.startDate !== undefined ||
        input.endDate !== undefined
      ) {
        await syncPeriods(
          tx,
          id,
          { startDate: nextStart, endDate: nextEnd, seats: nextSeats, unitAmount: nextUnit, billingCycle: nextCycle },
          rewriteFrom
        );
      }
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_SUBSCRIPTION_UPDATED",
          entityType: "OfficeSubscription",
          entityId: id,
          oldValues: auditJson({ name: current.name, seats: current.seats, status: current.status }),
          newValues: auditJson({ name: row.name, seats: row.seats, status: row.status }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return tx.officeSubscription.findUniqueOrThrow({
        where: { id },
        include: {
          office: { select: { id: true, name: true } },
          loginCredential: { select: { id: true, title: true } },
          periods: { orderBy: { yearMonth: "asc" } }
        }
      });
    });
    return publicSubscription(updated);
  },

  async deleteSubscription(organizationId: string, id: string, audit: AuditContext) {
    const current = await prisma.officeSubscription.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "VAULT_SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    assertSameOrganization(current.organizationId, organizationId, "VAULT_SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    await prisma.$transaction(async (tx) => {
      await tx.officeSubscription.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_SUBSCRIPTION_DELETED",
          entityType: "OfficeSubscription",
          entityId: id,
          oldValues: auditJson({ name: current.name }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
    });
  },

  async upsertPeriod(
    organizationId: string,
    id: string,
    yearMonth: string,
    input: { seats?: number; amount?: number; paid?: boolean; notes?: string | null },
    audit: AuditContext
  ) {
    const subscription = await prisma.officeSubscription.findUnique({ where: { id } });
    if (!subscription) throw new AppError(404, "VAULT_SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    assertSameOrganization(subscription.organizationId, organizationId, "VAULT_SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    const existing = await prisma.subscriptionPeriod.findUnique({ where: { subscriptionId_yearMonth: { subscriptionId: id, yearMonth } } });
    const seats = input.seats ?? existing?.seats ?? subscription.seats;
    const amount = input.amount !== undefined
      ? new Prisma.Decimal(input.amount.toFixed(2))
      : existing?.amount ?? periodAmount(seats, Number(subscription.unitAmount), subscription.billingCycle);
    const paid = input.paid ?? existing?.paid ?? false;
    const row = await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.subscriptionPeriod.update({
            where: { id: existing.id },
            data: {
              seats,
              amount,
              paid,
              paidAt: paid ? existing.paidAt ?? new Date() : null,
              ...(input.notes !== undefined ? { notes: blankToNull(input.notes) } : {})
            }
          })
        : await tx.subscriptionPeriod.create({
            data: {
              subscriptionId: id,
              yearMonth,
              seats,
              amount,
              paid,
              paidAt: paid ? new Date() : null,
              notes: blankToNull(input.notes)
            }
          });
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: "VAULT_SUBSCRIPTION_PERIOD_UPDATED",
          entityType: "SubscriptionPeriod",
          entityId: saved.id,
          newValues: auditJson({ subscriptionId: id, yearMonth, seats, amount: money(amount), paid }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent
        }
      });
      return saved;
    });
    return publicPeriod(row);
  },

  async summary(organizationId: string) {
    const thisMonth = currentYearMonth();
    const inThirty = new Date();
    inThirty.setUTCDate(inThirty.getUTCDate() + 30);
    const [activeCount, monthAgg, renewing] = await Promise.all([
      prisma.officeSubscription.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.subscriptionPeriod.aggregate({
        where: { yearMonth: thisMonth, subscription: { organizationId, status: "ACTIVE" } },
        _sum: { amount: true, seats: true }
      }),
      prisma.officeSubscription.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          endDate: { gte: new Date(), lte: inThirty }
        },
        select: { id: true, name: true, endDate: true, seats: true, currency: true },
        orderBy: { endDate: "asc" },
        take: 10
      })
    ]);
    return {
      yearMonth: thisMonth,
      activeCount,
      thisMonthSeats: monthAgg._sum.seats ?? 0,
      thisMonthTotal: money(monthAgg._sum.amount ?? new Prisma.Decimal(0)),
      renewingSoon: renewing.map((row) => ({
        id: row.id,
        name: row.name,
        endDate: row.endDate,
        seats: row.seats,
        currency: row.currency
      }))
    };
  }
};
