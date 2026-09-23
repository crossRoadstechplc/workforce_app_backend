import { prisma } from "../../database/prisma.js";
import { ROLE } from "../../shared/tenancy.js";
import type { TtPermissionRoleDb } from "./roles.js";

export type WorkforceRoleLabel = "Org Admin" | "Office Admin" | "Employee";

export type WorkforceStaffEnrichment = {
  department: string;
  office: string;
  workforceRole: WorkforceRoleLabel;
  employeeCode: string;
  email: string;
};

type Candidate = {
  userId: string;
  email: string;
  employeeId: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  office: string;
  employeeCode: string;
  workforceRole: WorkforceRoleLabel;
};

function buildDisplayName(firstName: string, lastName: string, fallback: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

/** In-memory unique name — reserved already includes all existing display names. */
function allocateDisplayName(base: string, email: string, userId: string, reserved: Set<string>) {
  let candidate = base;
  if (!reserved.has(candidate.toLowerCase())) {
    reserved.add(candidate.toLowerCase());
    return candidate;
  }
  const suffix = email.split("@")[0] || userId.slice(0, 8);
  candidate = `${base} (${suffix})`;
  let n = 2;
  while (reserved.has(candidate.toLowerCase())) {
    candidate = `${base} (${suffix}-${n})`;
    n += 1;
  }
  reserved.add(candidate.toLowerCase());
  return candidate;
}

function enrichmentFromCandidate(candidate: Candidate): WorkforceStaffEnrichment {
  return {
    department: candidate.department,
    office: candidate.office,
    workforceRole: candidate.workforceRole,
    employeeCode: candidate.employeeCode,
    email: candidate.email
  };
}

function preferWorkforceRole(current: WorkforceRoleLabel | undefined, next: WorkforceRoleLabel): WorkforceRoleLabel {
  const rank: Record<WorkforceRoleLabel, number> = {
    Employee: 1,
    "Office Admin": 2,
    "Org Admin": 3
  };
  if (!current) return next;
  return rank[next] > rank[current] ? next : current;
}

/**
 * Collect Workforce people who should appear as Task Tracker staff:
 * active employees + org admins + office admins for the organization.
 * Tracker permission roles are NOT derived here — new rows get JUNIOR_STAFF only.
 */
const candidatesCache = new Map<string, { at: number; value: Candidate[] }>();
const CANDIDATES_TTL_MS = 15_000;

export async function collectWorkforceStaffCandidates(organizationId: string): Promise<Candidate[]> {
  const cached = candidatesCache.get(organizationId);
  if (cached && Date.now() - cached.at < CANDIDATES_TTL_MS) {
    console.log("[tt-staff-sync] candidates cache hit", { organizationId, count: cached.value.length });
    return cached.value;
  }

  const started = Date.now();
  const byUserId = new Map<string, Candidate>();

  const employees = await prisma.employee.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: {
      user: { select: { id: true, email: true, status: true } },
      department: { select: { name: true } },
      office: { select: { name: true } }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  for (const employee of employees) {
    if (employee.user.status !== "ACTIVE") continue;
    byUserId.set(employee.userId, {
      userId: employee.userId,
      email: employee.user.email,
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      jobTitle: employee.jobTitle ?? "",
      department: employee.department?.name ?? "",
      office: employee.office?.name ?? "",
      employeeCode: employee.employeeCode,
      workforceRole: "Employee"
    });
  }

  const officeAdmins = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      adminOffices: { some: { office: { organizationId } } },
      userRoles: { some: { role: { name: ROLE.OFFICE_ADMIN } } }
    },
    select: {
      id: true,
      email: true,
      employee: {
        select: {
          id: true,
          organizationId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          employeeCode: true,
          department: { select: { name: true } },
          office: { select: { name: true } }
        }
      },
      adminOffices: {
        where: { office: { organizationId } },
        select: { office: { select: { name: true } } },
        take: 1
      }
    }
  });

  for (const admin of officeAdmins) {
    const existing = byUserId.get(admin.id);
    const emp = admin.employee?.organizationId === organizationId ? admin.employee : null;
    const officeName = emp?.office?.name ?? admin.adminOffices[0]?.office.name ?? "";
    if (existing) {
      existing.workforceRole = preferWorkforceRole(existing.workforceRole, "Office Admin");
      if (!existing.office && officeName) existing.office = officeName;
      continue;
    }
    const firstName = emp?.firstName ?? admin.email.split("@")[0] ?? "Admin";
    const lastName = emp?.lastName ?? "";
    byUserId.set(admin.id, {
      userId: admin.id,
      email: admin.email,
      employeeId: emp?.id ?? null,
      firstName,
      lastName,
      jobTitle: emp?.jobTitle ?? "",
      department: emp?.department?.name ?? "",
      office: officeName,
      employeeCode: emp?.employeeCode ?? "",
      workforceRole: "Office Admin"
    });
  }

  const orgAdmins = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      adminOrganizations: { some: { organizationId } }
    },
    select: {
      id: true,
      email: true,
      employee: {
        select: {
          id: true,
          organizationId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          employeeCode: true,
          department: { select: { name: true } },
          office: { select: { name: true } }
        }
      }
    }
  });

  for (const admin of orgAdmins) {
    const existing = byUserId.get(admin.id);
    const emp = admin.employee?.organizationId === organizationId ? admin.employee : null;
    if (existing) {
      existing.workforceRole = preferWorkforceRole(existing.workforceRole, "Org Admin");
      continue;
    }
    const firstName = emp?.firstName ?? admin.email.split("@")[0] ?? "Admin";
    const lastName = emp?.lastName ?? "";
    byUserId.set(admin.id, {
      userId: admin.id,
      email: admin.email,
      employeeId: emp?.id ?? null,
      firstName,
      lastName,
      jobTitle: emp?.jobTitle ?? "",
      department: emp?.department?.name ?? "",
      office: emp?.office?.name ?? "",
      employeeCode: emp?.employeeCode ?? "",
      workforceRole: "Org Admin"
    });
  }

  const value = [...byUserId.values()];
  candidatesCache.set(organizationId, { at: Date.now(), value });
  console.log("[tt-staff-sync] candidates loaded", {
    organizationId,
    count: value.length,
    ms: Date.now() - started
  });
  return value;
}

/**
 * Ensure every Workforce candidate has a TtStaffMember row.
 * Never overwrites an existing permissionRole (Workforce roles stay separate).
 * Returns enrichment in the same pass so callers do not re-query Workforce.
 */
export async function syncWorkforceStaffToWorkspace(input: {
  workspaceId: string;
  organizationId: string;
  /** When set, this user is created/kept as SUPER_ADMIN (e.g. enablement). */
  forceSuperAdminUserId?: string;
}): Promise<{ created: number; updated: number; enrichmentByUserId: Map<string, WorkforceStaffEnrichment> }> {
  const started = Date.now();
  const candidates = await collectWorkforceStaffCandidates(input.organizationId);
  const enrichmentByUserId = new Map<string, WorkforceStaffEnrichment>();
  for (const candidate of candidates) {
    enrichmentByUserId.set(candidate.userId, enrichmentFromCandidate(candidate));
  }

  const existing = await prisma.ttStaffMember.findMany({
    where: { workspaceId: input.workspaceId },
    select: {
      id: true,
      userId: true,
      displayName: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      sortOrder: true,
      permissionRole: true
    }
  });
  console.log("[tt-staff-sync] existing staff loaded", {
    workspaceId: input.workspaceId,
    existing: existing.length,
    candidates: candidates.length,
    ms: Date.now() - started
  });
  const byUserId = new Map(existing.map((row) => [row.userId, row]));
  const reservedNames = new Set(existing.map((row) => row.displayName.toLowerCase()));

  const missing = candidates.filter((c) => !byUserId.has(c.userId));
  const toUpdate: Array<{
    id: string;
    displayName: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    employeeId: string | null;
  }> = [];

  let maxSort = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);

  // Fast path: everyone already synced and profiles match — no writes.
  if (missing.length === 0) {
    let updated = 0;
    for (const candidate of candidates) {
      const current = byUserId.get(candidate.userId)!;
      const profileChanged =
        current.firstName !== candidate.firstName ||
        current.lastName !== candidate.lastName ||
        current.jobTitle !== candidate.jobTitle ||
        current.employeeId !== candidate.employeeId;
      const needsSuper =
        candidate.userId === input.forceSuperAdminUserId && current.permissionRole !== "SUPER_ADMIN";
      if (profileChanged || needsSuper) {
        toUpdate.push({
          id: current.id,
          displayName: current.displayName,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          jobTitle: candidate.jobTitle,
          employeeId: candidate.employeeId
        });
        if (needsSuper) {
          await prisma.ttStaffMember.update({
            where: { id: current.id },
            data: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              jobTitle: candidate.jobTitle,
              employeeId: candidate.employeeId,
              permissionRole: "SUPER_ADMIN"
            }
          });
        } else if (profileChanged) {
          await prisma.ttStaffMember.update({
            where: { id: current.id },
            data: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              jobTitle: candidate.jobTitle,
              employeeId: candidate.employeeId
            }
          });
        }
        updated += 1;
      }
    }
    console.log("[tt-staff-sync] fast path (no creates)", {
      workspaceId: input.workspaceId,
      created: 0,
      updated,
      ms: Date.now() - started
    });
    return { created: 0, updated, enrichmentByUserId };
  }

  const createRows = missing.map((candidate) => {
    maxSort += 1;
    const baseName = buildDisplayName(candidate.firstName, candidate.lastName, candidate.email);
    const displayName = allocateDisplayName(baseName, candidate.email, candidate.userId, reservedNames);
    let permissionRole: TtPermissionRoleDb = "JUNIOR_STAFF";
    if (candidate.userId === input.forceSuperAdminUserId || candidate.workforceRole === "Org Admin") {
      permissionRole = "SUPER_ADMIN";
    } else if (candidate.workforceRole === "Office Admin") {
      permissionRole = "LEAD";
    }
    return {
      workspaceId: input.workspaceId,
      userId: candidate.userId,
      employeeId: candidate.employeeId,
      displayName,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      jobTitle: candidate.jobTitle,
      permissionRole,
      sortOrder: maxSort
    };
  });

  if (createRows.length) {
    await prisma.ttStaffMember.createMany({ data: createRows });
    console.log("[tt-staff-sync] created staff", {
      workspaceId: input.workspaceId,
      created: createRows.length,
      names: createRows.map((r) => r.displayName)
    });
  }

  // Light profile refresh for people who already existed.
  let updated = 0;
  for (const candidate of candidates) {
    const current = byUserId.get(candidate.userId);
    if (!current) continue;
    const profileChanged =
      current.firstName !== candidate.firstName ||
      current.lastName !== candidate.lastName ||
      current.jobTitle !== candidate.jobTitle ||
      current.employeeId !== candidate.employeeId;
    const needsSuper =
      candidate.userId === input.forceSuperAdminUserId && current.permissionRole !== "SUPER_ADMIN";
    if (!profileChanged && !needsSuper) continue;
    await prisma.ttStaffMember.update({
      where: { id: current.id },
      data: {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: candidate.jobTitle,
        employeeId: candidate.employeeId,
        ...(needsSuper ? { permissionRole: "SUPER_ADMIN" as const } : {})
      }
    });
    updated += 1;
  }

  console.log("[tt-staff-sync] sync done", {
    workspaceId: input.workspaceId,
    created: createRows.length,
    updated,
    ms: Date.now() - started
  });
  return { created: createRows.length, updated, enrichmentByUserId };
}

export async function syncWorkforceStaffForOrganization(organizationId: string): Promise<void> {
  candidatesCache.delete(organizationId);
  const { ensureTtWorkspace } = await import("./workspace-bootstrap.js");
  const workspace = await ensureTtWorkspace(organizationId);
  await syncWorkforceStaffToWorkspace({
    workspaceId: workspace.id,
    organizationId
  });
}

export async function loadWorkforceEnrichmentMap(
  organizationId: string
): Promise<Map<string, WorkforceStaffEnrichment>> {
  const candidates = await collectWorkforceStaffCandidates(organizationId);
  const map = new Map<string, WorkforceStaffEnrichment>();
  for (const candidate of candidates) {
    map.set(candidate.userId, enrichmentFromCandidate(candidate));
  }
  return map;
}
