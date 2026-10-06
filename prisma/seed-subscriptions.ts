/**
 * Seed SPX vault subscriptions from ref/List of Subscriptions.xlsx (Overview).
 *
 * Decisions:
 * 1. Currency → USD (Excel prices are in $)
 * 2. GoDaddy → one parent with seats=26 (not one row per domain)
 * 3. Start month → 2026-01-01 for all (periods auto-fill 24 months when endDate omitted)
 * 4. Bluehost → unitAmount 27.05 from detail section; ACTIVE with closing notes
 * 5. History → overview-only (no Cursor/DO invoice period patches)
 *
 * Usage:
 *   npm run db:seed:subscriptions
 *   SEED_ORG_SLUG=spx npm run db:seed:subscriptions
 */
import "dotenv/config";
import { prisma } from "./seed/context.js";
import { seedOfficeSubscriptions } from "./seed/builders/subscriptions.js";

async function main() {
  const slug = (process.env.SEED_ORG_SLUG ?? "spx").trim().toLowerCase();
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    throw new Error(`Organization not found for slug="${slug}". Set SEED_ORG_SLUG.`);
  }

  console.log(`Seeding vault subscriptions for ${organization.name} (${organization.slug})...`);
  const result = await seedOfficeSubscriptions(prisma, organization.id, {
    startDate: process.env.SEED_SUBSCRIPTION_START ?? "2026-01-01"
  });
  console.log(`Done. created=${result.created} skipped=${result.skipped} periodsPerSub=${result.periodMonths}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
