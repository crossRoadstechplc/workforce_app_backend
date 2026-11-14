import type { CompanyAssetStatus, CompanyAssetType, Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { pageMeta, pagination } from "../../shared/pagination.js";
import { assertOfficeInScope, employeeOfficeFilter, type OfficeScope } from "../../shared/office-scope.js";
import { assertSameOrganization } from "../../shared/tenancy.js";
import { deliverNotification } from "../notifications/notification.service.js";
import type { AssetDraft } from "./company-asset.schemas.js";

const assetInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      userId: true,
      officeId: true,
      office: { select: { id: true, name: true } }
    }
  },
  assignedBy: { select: { id: true, email: true } },
  returnedBy: { select: { id: true, email: true } }
} satisfies Prisma.CompanyAssetInclude;

type AssetRow = Prisma.CompanyAssetGetPayload<{ include: typeof assetInclude }>;

function cleanNote(value?: string | null) {
  const note = value?.trim();
  return note ? note : null;
}

function serialize(row: AssetRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type,
    name: row.name,
    identifier: row.identifier,
    notes: row.notes,
    status: row.status,
    responseNote: row.responseNote,
    respondedAt: row.respondedAt,
    returnedAt: row.returnedAt,
    returnNote: row.returnNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    employee: {
      id: row.employee.id,
      firstName: row.employee.firstName,
      lastName: row.employee.lastName,
      employeeCode: row.employee.employeeCode,
      office: row.employee.office
    },
    assignedBy: row.assignedBy,
    returnedBy: row.returnedBy
  };
}

async function loadEmployee(organizationId: string, employeeId: string, scope: OfficeScope) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, organizationId: true, officeId: true, userId: true, firstName: true, lastName: true, status: true }
  });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
  assertSameOrganization(employee.organizationId, organizationId, "EMPLOYEE_NOT_FOUND", "Employee not found");
  assertOfficeInScope(scope, employee.officeId, "You do not manage this employee's office");
  return employee;
}

async function loadAsset(organizationId: string, id: string, scope: OfficeScope) {
  const asset = await prisma.companyAsset.findUnique({ where: { id }, include: assetInclude });
  if (!asset) throw new AppError(404, "COMPANY_ASSET_NOT_FOUND", "Company asset not found");
  assertSameOrganization(asset.organizationId, organizationId, "COMPANY_ASSET_NOT_FOUND", "Company asset not found");
  assertOfficeInScope(scope, asset.employee.officeId, "You do not manage this employee's office");
  return asset;
}

async function notifyUser(input: {
  userId: string;
  type: "COMPANY_ASSET_ASSIGNED" | "COMPANY_ASSET_UPDATED" | "COMPANY_ASSET_ACCEPTED" | "COMPANY_ASSET_DECLINED" | "COMPANY_ASSET_RETURNED";
  title: string;
  message: string;
  assetId: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityType: "CompanyAsset",
      relatedEntityId: input.assetId
    }
  });
  await deliverNotification(notification);
}

async function adminRecipientIds(organizationId: string, officeId: string | null, assignerId: string, employeeUserId: string) {
  const [orgAdmins, officeAdmins] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE", adminOrganizations: { some: { organizationId } } },
      select: { id: true }
    }),
    officeId
      ? prisma.user.findMany({
          where: { status: "ACTIVE", adminOffices: { some: { officeId } } },
          select: { id: true }
        })
      : Promise.resolve([])
  ]);
  return [...new Set([assignerId, ...orgAdmins.map((user) => user.id), ...officeAdmins.map((user) => user.id)])].filter(
    (id) => id !== employeeUserId
  );
}

function materialChange(current: { type: CompanyAssetType; name: string; identifier: string }, next: { type?: CompanyAssetType; name?: string; identifier?: string }) {
  return (
    (next.type !== undefined && next.type !== current.type) ||
    (next.name !== undefined && next.name !== current.name) ||
    (next.identifier !== undefined && next.identifier !== current.identifier)
  );
}

export const companyAssetService = {
  async assignMany(organizationId: string, employeeId: string, drafts: AssetDraft[], audit: AuditContext, scope: OfficeScope) {
    if (!drafts.length) return [];
    const employee = await loadEmployee(organizationId, employeeId, scope);
    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const draft of drafts) {
        const row = await tx.companyAsset.create({
          data: {
            organizationId,
            employeeId,
            type: draft.type,
            name: draft.name.trim(),
            identifier: draft.identifier.trim(),
            notes: cleanNote(draft.notes),
            assignedByUserId: audit.actorUserId
          },
          include: assetInclude
        });
        await tx.auditLog.create({
          data: {
            actorUserId: audit.actorUserId,
            action: "COMPANY_ASSET_ASSIGNED",
            entityType: "CompanyAsset",
            entityId: row.id,
            newValues: auditJson({ employeeId, type: row.type, name: row.name, identifier: row.identifier }),
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent
          }
        });
        rows.push(row);
      }
      return rows;
    });

    const title = created.length === 1 ? "Confirm a company asset" : "Confirm company assets";
    const message =
      created.length === 1
        ? `${created[0]!.name} was assigned to you. Open Company assets to accept or decline it.`
        : `${created.length} company items were assigned to you. Open Company assets to accept or decline each one.`;
    await notifyUser({
      userId: employee.userId,
      type: "COMPANY_ASSET_ASSIGNED",
      title,
      message,
      assetId: created[0]!.id
    });
    return created.map(serialize);
  },

  async update(organizationId: string, id: string, input: Partial<AssetDraft>, audit: AuditContext, scope: OfficeScope) {
    const current = await loadAsset(organizationId, id, scope);
    if (current.status === "RETURNED") {
      throw new AppError(409, "COMPANY_ASSET_CLOSED", "Returned items stay in history and cannot be edited");
    }
    const reopened = current.status !== "PENDING" && materialChange(current, input);
    const updated = await prisma.companyAsset.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.identifier !== undefined ? { identifier: input.identifier.trim() } : {}),
        ...(input.notes !== undefined ? { notes: cleanNote(input.notes) } : {}),
        ...(reopened ? { status: "PENDING", respondedAt: null, responseNote: null } : {})
      },
      include: assetInclude
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "COMPANY_ASSET_UPDATED",
        entityType: "CompanyAsset",
        entityId: id,
        oldValues: auditJson({ type: current.type, name: current.name, identifier: current.identifier, status: current.status }),
        newValues: auditJson({ type: updated.type, name: updated.name, identifier: updated.identifier, status: updated.status }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    await notifyUser({
      userId: current.employee.userId,
      type: "COMPANY_ASSET_UPDATED",
      title: reopened ? "Confirm an updated company asset" : "A company asset was updated",
      message: reopened
        ? `${updated.name} changed after you responded. Open Company assets and confirm the new details.`
        : `${updated.name} was updated. Open Company assets to review it.`,
      assetId: id
    });
    return serialize(updated);
  },

  async remove(organizationId: string, id: string, audit: AuditContext, scope: OfficeScope) {
    const current = await loadAsset(organizationId, id, scope);
    if (current.status === "ACCEPTED" || current.status === "RETURNED") {
      throw new AppError(409, "COMPANY_ASSET_ACCEPTED", "Accepted items must be marked returned instead of deleted");
    }
    await prisma.companyAsset.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "COMPANY_ASSET_REMOVED",
        entityType: "CompanyAsset",
        entityId: id,
        oldValues: auditJson({ name: current.name, identifier: current.identifier, status: current.status, employeeId: current.employeeId }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return { id };
  },

  async markReturned(organizationId: string, id: string, note: string | null | undefined, audit: AuditContext, scope: OfficeScope) {
    const current = await loadAsset(organizationId, id, scope);
    if (current.status !== "ACCEPTED") {
      throw new AppError(409, "COMPANY_ASSET_NOT_HELD", "Only an accepted item can be marked returned");
    }
    const updated = await prisma.companyAsset.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnedAt: new Date(),
        returnedByUserId: audit.actorUserId,
        returnNote: cleanNote(note)
      },
      include: assetInclude
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "COMPANY_ASSET_RETURNED",
        entityType: "CompanyAsset",
        entityId: id,
        newValues: auditJson({ name: updated.name, identifier: updated.identifier }),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    await notifyUser({
      userId: current.employee.userId,
      type: "COMPANY_ASSET_RETURNED",
      title: "Company asset returned",
      message: `${updated.name} was recorded as returned.`,
      assetId: id
    });
    return serialize(updated);
  },

  async adminList(
    organizationId: string,
    input: { page: number; pageSize: number; status?: CompanyAssetStatus; employeeId?: string; officeId?: string; search?: string },
    scope: OfficeScope
  ) {
    const officeFilter = employeeOfficeFilter(scope, input.officeId);
    const search = input.search?.trim();
    const where: Prisma.CompanyAssetWhereInput = {
      organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      AND: [
        { employee: officeFilter },
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { identifier: { contains: search, mode: "insensitive" as const } },
                  { employee: { firstName: { contains: search, mode: "insensitive" as const } } },
                  { employee: { lastName: { contains: search, mode: "insensitive" as const } } },
                  { employee: { employeeCode: { contains: search, mode: "insensitive" as const } } }
                ]
              }
            ]
          : [])
      ]
    };
    const countWhere: Prisma.CompanyAssetWhereInput = { organizationId, employee: officeFilter };
    const [items, total, pending, accepted, declined, returned] = await prisma.$transaction([
      prisma.companyAsset.findMany({
        where,
        include: assetInclude,
        orderBy: { createdAt: "desc" },
        ...pagination(input)
      }),
      prisma.companyAsset.count({ where }),
      prisma.companyAsset.count({ where: { ...countWhere, status: "PENDING" } }),
      prisma.companyAsset.count({ where: { ...countWhere, status: "ACCEPTED" } }),
      prisma.companyAsset.count({ where: { ...countWhere, status: "DECLINED" } }),
      prisma.companyAsset.count({ where: { ...countWhere, status: "RETURNED" } })
    ]);
    const counts = { PENDING: pending, ACCEPTED: accepted, DECLINED: declined, RETURNED: returned };
    return { items: items.map(serialize), meta: pageMeta(input.page, input.pageSize, total), counts };
  },

  async mine(userId: string) {
    const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (!employee || employee.status !== "ACTIVE") throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
    const items = await prisma.companyAsset.findMany({
      where: { employeeId: employee.id },
      include: assetInclude,
      orderBy: { createdAt: "desc" },
      take: 200
    });
    const serialized = items.map(serialize);
    return { items: serialized, pendingCount: serialized.filter((item) => item.status === "PENDING").length };
  },

  async respond(userId: string, id: string, decision: "ACCEPTED" | "DECLINED", note?: string) {
    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true, organizationId: true, officeId: true, userId: true, firstName: true, lastName: true, status: true }
    });
    if (!employee || employee.status !== "ACTIVE") throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
    const asset = await prisma.companyAsset.findFirst({ where: { id, employeeId: employee.id }, include: assetInclude });
    if (!asset) throw new AppError(404, "COMPANY_ASSET_NOT_FOUND", "Company asset not found");
    if (asset.status !== "PENDING") throw new AppError(409, "COMPANY_ASSET_ALREADY_ANSWERED", "This item is no longer waiting for your response");
    const updated = await prisma.companyAsset.update({
      where: { id },
      data: { status: decision, respondedAt: new Date(), responseNote: cleanNote(note) },
      include: assetInclude
    });
    const recipients = await adminRecipientIds(employee.organizationId, employee.officeId, asset.assignedByUserId, employee.userId);
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    await Promise.all(
      recipients.map((recipientId) =>
        notifyUser({
          userId: recipientId,
          type: decision === "ACCEPTED" ? "COMPANY_ASSET_ACCEPTED" : "COMPANY_ASSET_DECLINED",
          title: decision === "ACCEPTED" ? "Company asset accepted" : "Company asset declined",
          message:
            decision === "ACCEPTED"
              ? `${employeeName} accepted ${updated.name}.`
              : `${employeeName} declined ${updated.name}${updated.responseNote ? `: ${updated.responseNote}` : "."}`,
          assetId: id
        })
      )
    );
    return serialize(updated);
  }
};
