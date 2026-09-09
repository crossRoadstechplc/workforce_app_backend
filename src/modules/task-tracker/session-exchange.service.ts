import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";

const EXCHANGE_TTL_MS = 60_000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const sessionExchangeService = {
  async create(input: { userId: string; contextKey: string }) {
    const exchangeToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + EXCHANGE_TTL_MS);

    await prisma.ttSessionExchange.create({
      data: {
        tokenHash: hashToken(exchangeToken),
        userId: input.userId,
        contextKey: input.contextKey,
        expiresAt
      }
    });

    return { exchangeToken, expiresAt: expiresAt.toISOString() };
  },

  async consume(exchangeToken: string) {
    const tokenHash = hashToken(exchangeToken);
    const row = await prisma.ttSessionExchange.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new AppError(401, "EXCHANGE_INVALID", "Exchange token is invalid or expired");
    }

    const updated = await prisma.ttSessionExchange.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (updated.count !== 1) {
      throw new AppError(401, "EXCHANGE_INVALID", "Exchange token is invalid or expired");
    }

    return {
      userId: row.userId,
      contextKey: row.contextKey,
      expiresAt: row.expiresAt
    };
  }
};
