import { Prisma } from "../../../src/generated/prisma/client.js";
import type { PrismaClient } from "../../../src/generated/prisma/client.js";

/** SPX List of Subscriptions.xlsx — Overview rows (seed decisions documented in seed-subscriptions.ts). */
export const SPX_OVERVIEW_SUBSCRIPTIONS = [
  {
    name: "Bluehost (Domains & WordPress)",
    vendor: "Bluehost",
    category: "Hosting & Domains",
    seats: 1,
    unitAmount: 27.05,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: Off. To be closed soon. Price from Bluehost WordPress Plus detail ($27.05); overview total was blank."
  },
  {
    name: "Digital Ocean",
    vendor: "DigitalOcean",
    category: "Cloud Hosting",
    seats: 1,
    unitAmount: 64.21,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: On."
  },
  {
    name: "Cursor Pro",
    vendor: "Cursor",
    category: "AI Coding Subscription",
    seats: 1,
    unitAmount: 100,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: On. Entry-level plan with premium models and unlimited tab completions."
  },
  {
    name: "SiteGround",
    vendor: "SiteGround",
    category: "Hosting",
    seats: 1,
    unitAmount: 35,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: On. GrowBig Hosting — many sites billed under one subscription."
  },
  {
    name: "GoDaddy",
    vendor: "GoDaddy",
    category: "Domains",
    seats: 26,
    unitAmount: 1.099,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: On. Domains have separate renewal payments. Seeded as one parent with 26 seats from overview."
  },
  {
    name: "ChatGPT",
    vendor: "OpenAI",
    category: "AI Subscription",
    seats: 3,
    unitAmount: 20,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: On."
  },
  {
    name: "Claude",
    vendor: "Anthropic",
    category: "AI Subscription",
    seats: 1,
    unitAmount: 100,
    currency: "USD",
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    notes: "Auto renew: On. Only Biniam can access."
  }
] as const;

function addMonths(yearMonth: string, count: number) {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + count);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

/**
 * Mirrors vault.service syncPeriods for create: start → end, or +23 months if no end.
 */
export async function seedOfficeSubscriptions(
  prisma: PrismaClient,
  organizationId: string,
  options?: { startDate?: string; endDate?: string | null; officeId?: string | null }
) {
  const startDate = options?.startDate ?? "2026-01-01";
  const endDate = options?.endDate === undefined ? null : options.endDate;
  const startYm = startDate.slice(0, 7);
  const endYm = endDate ? endDate.slice(0, 7) : addMonths(startYm, 23);
  const months = monthsInRange(startYm, endYm);

  let created = 0;
  let skipped = 0;

  for (const row of SPX_OVERVIEW_SUBSCRIPTIONS) {
    const existing = await prisma.officeSubscription.findFirst({
      where: { organizationId, name: row.name },
      select: { id: true }
    });
    if (existing) {
      skipped += 1;
      console.log(`  skip (exists) ${row.name}`);
      continue;
    }

    const amount = periodAmount(row.seats, row.unitAmount, row.billingCycle);
    await prisma.officeSubscription.create({
      data: {
        organizationId,
        officeId: options?.officeId ?? null,
        name: row.name,
        vendor: row.vendor,
        category: row.category,
        status: row.status,
        billingCycle: row.billingCycle,
        seats: row.seats,
        unitAmount: new Prisma.Decimal(row.unitAmount.toFixed(2)),
        currency: row.currency,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
        notes: row.notes,
        periods: {
          create: months.map((yearMonth) => ({
            yearMonth,
            seats: row.seats,
            amount
          }))
        }
      }
    });
    created += 1;
    console.log(`  + ${row.name} (${row.seats} seats × ${row.unitAmount} ${row.currency}, ${months.length} periods)`);
  }

  return { created, skipped, periodMonths: months.length };
}
