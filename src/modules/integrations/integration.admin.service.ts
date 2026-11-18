import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { encryptSecret } from "../vault/vault-crypto.js";
import { apiKeyPreview, generateApiKey } from "./api-key.js";
import { generateWebhookSecret, webhookUrlProblem } from "./webhook-signature.js";
import { webhookService } from "./webhook.service.js";

const integrationSelect = {
  id: true,
  organizationId: true,
  name: true,
  keyPrefix: true,
  officeIds: true,
  isActive: true,
  revokedAt: true,
  lastUsedAt: true,
  webhookUrl: true,
  webhookSecretEnc: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { email: true } }
} as const;

const deliverySelect = {
  id: true,
  event: true,
  status: true,
  attempts: true,
  lastStatusCode: true,
  lastError: true,
  nextAttemptAt: true,
  deliveredAt: true,
  createdAt: true,
  payload: true
} as const;

type IntegrationRow = {
  id: string;
  name: string;
  keyPrefix: string;
  officeIds: string[];
  isActive: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  webhookUrl: string | null;
  webhookSecretEnc: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { email: string };
};

async function officeNames(organizationId: string) {
  const offices = await prisma.office.findMany({ where: { organizationId }, select: { id: true, name: true } });
  return new Map(offices.map((o) => [o.id, o.name]));
}

async function serialize(row: IntegrationRow, names: Map<string, string>) {
  const [lastDelivery, failedDeliveries, bookingCount] = await Promise.all([
    prisma.webhookDelivery.findFirst({
      where: { integrationId: row.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, event: true, status: true, lastStatusCode: true, createdAt: true }
    }),
    prisma.webhookDelivery.count({ where: { integrationId: row.id, status: "FAILED" } }),
    prisma.meetingBooking.count({ where: { integrationId: row.id } })
  ]);
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    keyPreview: apiKeyPreview(row.keyPrefix),
    status: row.revokedAt ? ("REVOKED" as const) : row.isActive ? ("ACTIVE" as const) : ("PAUSED" as const),
    isActive: row.isActive,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    allOffices: row.officeIds.length === 0,
    officeIds: row.officeIds,
    offices: row.officeIds.map((id) => ({ id, name: names.get(id) ?? "Removed office" })),
    webhookUrl: row.webhookUrl,
    hasWebhookSecret: Boolean(row.webhookSecretEnc),
    lastDelivery,
    failedDeliveries,
    bookingCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByEmail: row.createdBy.email
  };
}

async function loadIntegration(organizationId: string, id: string) {
  const row = await prisma.apiIntegration.findFirst({ where: { id, organizationId }, select: integrationSelect });
  if (!row) throw new AppError(404, "INTEGRATION_NOT_FOUND", "Integration not found");
  return row;
}

function assertNotRevoked(row: { revokedAt: Date | null }) {
  if (row.revokedAt) throw new AppError(409, "INTEGRATION_REVOKED", "This integration was revoked. Create a new one instead.");
}

async function assertOfficesBelong(organizationId: string, officeIds: string[]) {
  const unique = [...new Set(officeIds)];
  if (!unique.length) return unique;
  const count = await prisma.office.count({ where: { organizationId, id: { in: unique } } });
  if (count !== unique.length) throw new AppError(400, "INVALID_OFFICE", "One or more offices do not belong to this company");
  return unique;
}

function assertWebhookUrl(url: string) {
  const problem = webhookUrlProblem(url, { production: env.NODE_ENV === "production" });
  if (problem) throw new AppError(400, "INVALID_WEBHOOK_URL", problem);
}

async function audit(ctx: AuditContext, action: string, entityId: string, values: { old?: unknown; new?: unknown }) {
  await prisma.auditLog.create({
    data: {
      actorUserId: ctx.actorUserId,
      action,
      entityType: "ApiIntegration",
      entityId,
      oldValues: values.old === undefined ? undefined : auditJson(values.old),
      newValues: values.new === undefined ? undefined : auditJson(values.new),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent
    }
  });
}

export const integrationAdminService = {
  async list(organizationId: string) {
    const [rows, names] = await Promise.all([
      prisma.apiIntegration.findMany({ where: { organizationId }, select: integrationSelect, orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] }),
      officeNames(organizationId)
    ]);
    return { items: await Promise.all(rows.map((row) => serialize(row, names))) };
  },

  async create(organizationId: string, input: { name: string; officeIds: string[]; webhookUrl?: string | null }, ctx: AuditContext) {
    const officeIds = await assertOfficesBelong(organizationId, input.officeIds);
    if (input.webhookUrl) assertWebhookUrl(input.webhookUrl);
    const key = generateApiKey();
    const webhookSecret = input.webhookUrl ? generateWebhookSecret() : null;
    const row = await prisma.apiIntegration.create({
      data: {
        organizationId,
        name: input.name,
        keyPrefix: key.prefix,
        keyHash: key.hash,
        officeIds,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecretEnc: webhookSecret ? encryptSecret(webhookSecret) : null,
        createdByUserId: ctx.actorUserId
      },
      select: integrationSelect
    });
    await audit(ctx, "API_INTEGRATION_CREATED", row.id, { new: { name: row.name, officeIds, webhookUrl: row.webhookUrl, keyPrefix: row.keyPrefix } });
    return { integration: await serialize(row, await officeNames(organizationId)), apiKey: key.apiKey, webhookSecret };
  },

  async update(
    organizationId: string,
    id: string,
    input: { name?: string; officeIds?: string[]; webhookUrl?: string | null; isActive?: boolean },
    ctx: AuditContext
  ) {
    const current = await loadIntegration(organizationId, id);
    assertNotRevoked(current);
    const officeIds = input.officeIds !== undefined ? await assertOfficesBelong(organizationId, input.officeIds) : undefined;
    if (input.webhookUrl) assertWebhookUrl(input.webhookUrl);
    // A secret is created the first time a webhook URL is set; it is returned once.
    const webhookSecret = input.webhookUrl && !current.webhookSecretEnc ? generateWebhookSecret() : null;
    const row = await prisma.apiIntegration.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(officeIds !== undefined ? { officeIds } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.webhookUrl !== undefined ? { webhookUrl: input.webhookUrl } : {}),
        ...(input.webhookUrl === null ? { webhookSecretEnc: null } : {}),
        ...(webhookSecret ? { webhookSecretEnc: encryptSecret(webhookSecret) } : {})
      },
      select: integrationSelect
    });
    await audit(ctx, "API_INTEGRATION_UPDATED", id, {
      old: { name: current.name, officeIds: current.officeIds, webhookUrl: current.webhookUrl, isActive: current.isActive },
      new: { name: row.name, officeIds: row.officeIds, webhookUrl: row.webhookUrl, isActive: row.isActive }
    });
    return { integration: await serialize(row, await officeNames(organizationId)), webhookSecret };
  },

  async rotateKey(organizationId: string, id: string, ctx: AuditContext) {
    const current = await loadIntegration(organizationId, id);
    assertNotRevoked(current);
    const key = generateApiKey();
    const row = await prisma.apiIntegration.update({
      where: { id },
      data: { keyPrefix: key.prefix, keyHash: key.hash },
      select: integrationSelect
    });
    await audit(ctx, "API_INTEGRATION_KEY_ROTATED", id, { old: { keyPrefix: current.keyPrefix }, new: { keyPrefix: key.prefix } });
    return { integration: await serialize(row, await officeNames(organizationId)), apiKey: key.apiKey };
  },

  async rotateWebhookSecret(organizationId: string, id: string, ctx: AuditContext) {
    const current = await loadIntegration(organizationId, id);
    assertNotRevoked(current);
    if (!current.webhookUrl) throw new AppError(409, "WEBHOOK_NOT_CONFIGURED", "Add a webhook URL first");
    const webhookSecret = generateWebhookSecret();
    const row = await prisma.apiIntegration.update({
      where: { id },
      data: { webhookSecretEnc: encryptSecret(webhookSecret) },
      select: integrationSelect
    });
    await audit(ctx, "API_INTEGRATION_WEBHOOK_SECRET_ROTATED", id, {});
    return { integration: await serialize(row, await officeNames(organizationId)), webhookSecret };
  },

  async revoke(organizationId: string, id: string, ctx: AuditContext) {
    const current = await loadIntegration(organizationId, id);
    if (current.revokedAt) return { integration: await serialize(current, await officeNames(organizationId)) };
    const row = await prisma.apiIntegration.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date() },
      select: integrationSelect
    });
    await audit(ctx, "API_INTEGRATION_REVOKED", id, { old: { isActive: current.isActive }, new: { revoked: true } });
    return { integration: await serialize(row, await officeNames(organizationId)) };
  },

  /** Sends a `ping` event now and returns the delivery result so the admin sees it immediately. */
  async testWebhook(organizationId: string, id: string) {
    const current = await loadIntegration(organizationId, id);
    assertNotRevoked(current);
    if (!current.isActive) throw new AppError(409, "INTEGRATION_PAUSED", "Resume the integration before testing its webhook");
    const deliveryId = await webhookService.enqueue(
      prisma,
      id,
      "ping",
      { message: "Test event from Workforce", integration: { id: current.id, name: current.name } },
      "ADMIN"
    );
    if (!deliveryId) throw new AppError(409, "WEBHOOK_NOT_CONFIGURED", "Add a webhook URL first");
    await webhookService.deliver(deliveryId);
    return prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, select: deliverySelect });
  },

  async deliveries(organizationId: string, id: string, input: { page: number; pageSize: number }) {
    await loadIntegration(organizationId, id);
    const where = { integrationId: id };
    const [items, total] = await prisma.$transaction([
      prisma.webhookDelivery.findMany({ where, select: deliverySelect, orderBy: { createdAt: "desc" }, ...pagination(input) }),
      prisma.webhookDelivery.count({ where })
    ]);
    return { items, meta: pageMeta(input.page, input.pageSize, total) };
  },

  async retryDelivery(organizationId: string, deliveryId: string, ctx: AuditContext) {
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, integration: { organizationId } },
      select: { id: true, status: true, integrationId: true }
    });
    if (!delivery) throw new AppError(404, "DELIVERY_NOT_FOUND", "Webhook delivery not found");
    if (delivery.status === "SUCCEEDED") throw new AppError(409, "DELIVERY_ALREADY_SUCCEEDED", "This event was already delivered");
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "PENDING", nextAttemptAt: new Date() } });
    await audit(ctx, "API_INTEGRATION_WEBHOOK_RETRIED", delivery.integrationId, { new: { deliveryId } });
    await webhookService.deliver(deliveryId);
    return prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, select: deliverySelect });
  }
};
