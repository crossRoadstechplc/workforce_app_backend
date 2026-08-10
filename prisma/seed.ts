import "dotenv/config";
import { prisma } from "./seed/context.js";
import { bootstrap } from "./seed/bootstrap.js";
import { seedDemo } from "./seed/demo.js";
import { loadFixture } from "./seed/types.js";
import { printManifest } from "./seed/manifest.js";

async function main() {
  const bootstrapResult = await bootstrap();

  if (process.env.SEED_DEMO_DATA !== "false") {
    const fixture = loadFixture();
    await seedDemo(fixture, bootstrapResult);
  } else {
    console.log("SEED_DEMO_DATA=false — skipping fixture demo tenants");
  }

  printManifest(bootstrapResult);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
