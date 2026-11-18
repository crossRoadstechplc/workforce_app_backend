import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { auditJson } from "../../shared/audit.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { decryptSecret } from "../vault/vault-crypto.js";
import { isPrivateAddress, nextRetryDelayMs, signWebhookPayload, WEBHOOK_TIMEOUT_MS } from "./webhook-signature.js";

export type WebhookEvent = "booking.created" | "booking.rescheduled" | "booking.cancelled" | "ping";
export type WebhookChangedBy = "API" | "ADMIN" | "EMPLOYEE" | "SYSTEM";
type Db = Prisma.TransactionClient | typeof prisma;

/** While one worker sends a delivery, others skip it for this long. */
const LEASE_MS = 2 * 60_000;

async function assertPublicHost(url: URL) {
  if (env.NODE_ENV !== "production") return;
  const results = await lookup(url.hostname, { all: true });
  if (!results.length || results.some((r) => isPrivateAddress(r.address))) {
    throw new Error("Webhook host resolves to a private address");
  }
}

export const webhookService = {
  /**
   * Queue an event for an integration's webhook. Call inside the same transaction as the booking
   * change so the event is never lost. Returns the delivery id, or null when no webhook is configured.
   */
  async enqueue(
    db: Db,
    integrationId: string | null | undefined,
    event: WebhookEvent,
    data: unknown,
    changedBy: WebhookChangedBy
  ): Promise<string | null> {
    if (!integrationId) return null;
    const integration = await db.apiIntegration.findUnique({
      where: { id: integrationId },
      select: { webhookUrl: true, webhookSecretEnc: true, isActive: true, revokedAt: true }
    });
    if (!integration?.webhookUrl || !integration.webhookSecretEnc || !integration.isActive || integration.revokedAt) return null;
    const id = randomUUID();
    await db.webhookDelivery.create({
      data: {
        id,
        integrationId,
        event,
        payload: auditJson({ id, event, occurredAt: new Date(), changedBy, data })
      }
    });
    return id;
  },

  /** Fire-and-forget first attempt right after the transaction commits; the cron job retries failures. */
  deliverSoon(ids: Array<string | null | undefined>) {
    for (const id of ids) {
      if (!id) continue;
      void webhookService.deliver(id).catch((err) => logger.warn({ err, deliveryId: id }, "Webhook delivery attempt crashed"));
    }
  },

  async deliver(id: string) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id, status: "PENDING", nextAttemptAt: { lte: new Date() } },
      data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) }
    });
    if (claimed.count !== 1) return;

    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id },
      include: { integration: { select: { webhookUrl: true, webhookSecretEnc: true, isActive: true, revokedAt: true } } }
    });
    if (!delivery) return;
    const attempts = delivery.attempts + 1;
    const { integration } = delivery;

    if (!integration.webhookUrl || !integration.webhookSecretEnc || integration.revokedAt || !integration.isActive) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: "FAILED", attempts, lastError: "Webhook is not configured or the integration is paused/revoked" }
      });
      return;
    }

    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      const url = new URL(integration.webhookUrl);
      await assertPublicHost(url);
      const body = JSON.stringify(delivery.payload);
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        headers: {
          "content-type": "application/json",
          "user-agent": "Workforce-Webhooks/1.0",
          "x-workforce-event": delivery.event,
          "x-workforce-delivery": delivery.id,
          "x-workforce-signature": signWebhookPayload(decryptSecret(integration.webhookSecretEnc), body)
        },
        body
      });
      statusCode = response.status;
      await response.body?.cancel().catch(() => undefined);
      if (response.status < 200 || response.status >= 300) error = `Receiver answered HTTP ${response.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (!error) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: "SUCCEEDED", attempts, lastStatusCode: statusCode, lastError: null, deliveredAt: new Date() }
      });
      return;
    }
    const delay = nextRetryDelayMs(attempts);
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: delay === null ? "FAILED" : "PENDING",
        attempts,
        lastStatusCode: statusCode,
        lastError: error.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + (delay ?? 0))
      }
    });
    logger.warn({ deliveryId: id, attempts, statusCode, error }, "Webhook delivery failed");
  },

  /** Cron entry point: send every delivery whose retry time has come. */
  async runDue(limit = 100) {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
      select: { id: true }
    });
    for (const row of due) await webhookService.deliver(row.id);
    return { processed: due.length };
  }
};
