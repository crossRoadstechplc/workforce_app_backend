import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifest } from "./context.js";
import type { BootstrapResult } from "./bootstrap.js";

export function printManifest(bootstrap: BootstrapResult) {
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Demo123!";
  const demoEnabled = process.env.SEED_DEMO_DATA !== "false";

  const lines: string[] = [
    "# Seed credentials (generated — do not commit)",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Platform",
    "",
    "| Role | Email | Password | Notes |",
    "|------|-------|----------|-------|",
    `| SUPER_ADMIN | ${bootstrap.superAdminEmail} | ${bootstrap.superAdminPassword} | Platform console |`
  ];

  if (demoEnabled) {
    lines.push(
      "",
      "## Demo tenants",
      "",
      `Shared demo password: \`${demoPassword}\``,
      "",
      "| Role | Organization | Email | Employee code | Notes |",
      "|------|--------------|-------|---------------|-------|"
    );
    for (const entry of manifest.filter((m) => m.role !== "SUPER_ADMIN")) {
      lines.push(
        `| ${entry.role} | ${entry.organization ?? "—"} | ${entry.email} | ${entry.employeeCode ?? "—"} | ${entry.notes ?? ""} |`
      );
    }
  } else {
    lines.push("", "_Demo seed disabled (`SEED_DEMO_DATA=false`). Only bootstrap accounts above._");
  }

  lines.push("", "## Quick flows", "");
  if (demoEnabled) {
    lines.push(
      "- **SuperAdmin:** login → Organizations → see Acme + Globex",
      "- **Acme org admin:** `admin@acme.demo` → dashboard, employees, pending leave for ACM003",
      "- **Employee app:** `sara@acme.demo` or code `ACM001` (+ org slug `acme-corp` if needed)",
      "- **Globex isolation:** `admin@globex.demo` must not see Acme employees"
    );
  }

  const content = lines.join("\n");
  const dir = dirname(fileURLToPath(import.meta.url));
  const outPath = join(dir, "SEED_CREDENTIALS.md");
  writeFileSync(outPath, content, "utf8");

  console.log("\n========== SEED CREDENTIALS ==========");
  console.log(`SUPER_ADMIN  ${bootstrap.superAdminEmail}  /  ${bootstrap.superAdminPassword}`);
  if (demoEnabled) {
    console.log(`DEMO PASSWORD (all fixture users): ${demoPassword}`);
    for (const entry of manifest.filter((m) => m.role !== "SUPER_ADMIN")) {
      const code = entry.employeeCode ? ` [${entry.employeeCode}]` : "";
      console.log(`${entry.role.padEnd(11)} ${entry.email}${code}  (${entry.organization ?? "platform"})`);
    }
  }
  console.log(`\nFull manifest: ${outPath}`);
  console.log("======================================\n");
}
