import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { auditJson, type AuditContext } from "../../shared/audit.js";
import { assertSameOrganization } from "../../shared/tenancy.js";
import { assertOfficeInScope, type OfficeScope } from "../../shared/office-scope.js";

export const MAX_EMERGENCY_CONTACTS = 5;

export type EmergencyContactRelation =
  | "MOTHER"
  | "FATHER"
  | "BROTHER"
  | "SISTER"
  | "SPOUSE"
  | "CHILD"
  | "FRIEND"
  | "RELATIVE"
  | "OTHER";

export type EmergencyContactInput = {
  name: string;
  phone: string;
  relation?: EmergencyContactRelation | null;
  relationOther?: string | null;
};

function mapContact(contact: {
  id: string;
  name: string;
  phone: string;
  relation: EmergencyContactRelation | null;
  relationOther: string | null;
  sortOrder: number;
}) {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    relation: contact.relation,
    relationOther: contact.relation === "OTHER" ? contact.relationOther : null,
    sortOrder: contact.sortOrder
  };
}

async function requireActiveEmployeeByUserId(userId: string) {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    include: { user: { select: { status: true } } }
  });
  if (!employee || employee.status !== "ACTIVE" || employee.user.status !== "ACTIVE") {
    throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
  }
  return employee;
}

async function requireEmployeeInScope(organizationId: string, employeeId: string, scope: OfficeScope) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee not found");
  assertSameOrganization(employee.organizationId, organizationId, "EMPLOYEE_NOT_FOUND", "Employee not found");
  assertOfficeInScope(scope, employee.officeId, "You do not manage this employee's office");
  return employee;
}

async function assertUnderLimit(employeeId: string) {
  const count = await prisma.employeeEmergencyContact.count({ where: { employeeId } });
  if (count >= MAX_EMERGENCY_CONTACTS) {
    throw new AppError(400, "EMERGENCY_CONTACT_LIMIT", `You can add up to ${MAX_EMERGENCY_CONTACTS} emergency contacts`);
  }
}

function normalizeInput(input: EmergencyContactInput) {
  const relation = input.relation ?? null;
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    relation,
    relationOther: relation === "OTHER" ? input.relationOther?.trim() || null : null
  };
}

export const emergencyContactService = {
  async listForEmployee(employeeId: string) {
    const items = await prisma.employeeEmergencyContact.findMany({
      where: { employeeId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    return items.map(mapContact);
  },

  async listMine(userId: string) {
    const employee = await requireActiveEmployeeByUserId(userId);
    return this.listForEmployee(employee.id);
  },

  async createMine(userId: string, input: EmergencyContactInput, audit: AuditContext) {
    const employee = await requireActiveEmployeeByUserId(userId);
    return this.createForEmployee(employee.id, input, audit);
  },

  async updateMine(userId: string, contactId: string, input: Partial<EmergencyContactInput>, audit: AuditContext) {
    const employee = await requireActiveEmployeeByUserId(userId);
    return this.updateForEmployee(employee.id, contactId, input, audit);
  },

  async deleteMine(userId: string, contactId: string, audit: AuditContext) {
    const employee = await requireActiveEmployeeByUserId(userId);
    return this.deleteForEmployee(employee.id, contactId, audit);
  },

  async createAdmin(organizationId: string, employeeId: string, input: EmergencyContactInput, audit: AuditContext, scope: OfficeScope) {
    await requireEmployeeInScope(organizationId, employeeId, scope);
    return this.createForEmployee(employeeId, input, audit);
  },

  async updateAdmin(
    organizationId: string,
    employeeId: string,
    contactId: string,
    input: Partial<EmergencyContactInput>,
    audit: AuditContext,
    scope: OfficeScope
  ) {
    await requireEmployeeInScope(organizationId, employeeId, scope);
    return this.updateForEmployee(employeeId, contactId, input, audit);
  },

  async deleteAdmin(organizationId: string, employeeId: string, contactId: string, audit: AuditContext, scope: OfficeScope) {
    await requireEmployeeInScope(organizationId, employeeId, scope);
    return this.deleteForEmployee(employeeId, contactId, audit);
  },

  async createForEmployee(employeeId: string, input: EmergencyContactInput, audit: AuditContext) {
    await assertUnderLimit(employeeId);
    const data = normalizeInput(input);
    const maxSort = await prisma.employeeEmergencyContact.aggregate({
      where: { employeeId },
      _max: { sortOrder: true }
    });
    const created = await prisma.employeeEmergencyContact.create({
      data: {
        employeeId,
        ...data,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1
      }
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "EMPLOYEE_EMERGENCY_CONTACT_CREATED",
        entityType: "EmployeeEmergencyContact",
        entityId: created.id,
        newValues: auditJson(mapContact(created)),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return mapContact(created);
  },

  async updateForEmployee(employeeId: string, contactId: string, input: Partial<EmergencyContactInput>, audit: AuditContext) {
    const current = await prisma.employeeEmergencyContact.findUnique({ where: { id: contactId } });
    if (!current || current.employeeId !== employeeId) {
      throw new AppError(404, "EMERGENCY_CONTACT_NOT_FOUND", "Emergency contact not found");
    }
    const nextRelation = input.relation !== undefined ? input.relation : current.relation;
    const updated = await prisma.employeeEmergencyContact.update({
      where: { id: contactId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
        ...(input.relation !== undefined ? { relation: input.relation } : {}),
        relationOther:
          nextRelation === "OTHER"
            ? input.relationOther !== undefined
              ? input.relationOther?.trim() || null
              : current.relationOther
            : null
      }
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "EMPLOYEE_EMERGENCY_CONTACT_UPDATED",
        entityType: "EmployeeEmergencyContact",
        entityId: contactId,
        oldValues: auditJson(mapContact(current)),
        newValues: auditJson(mapContact(updated)),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return mapContact(updated);
  },

  async deleteForEmployee(employeeId: string, contactId: string, audit: AuditContext) {
    const current = await prisma.employeeEmergencyContact.findUnique({ where: { id: contactId } });
    if (!current || current.employeeId !== employeeId) {
      throw new AppError(404, "EMERGENCY_CONTACT_NOT_FOUND", "Emergency contact not found");
    }
    await prisma.employeeEmergencyContact.delete({ where: { id: contactId } });
    await prisma.auditLog.create({
      data: {
        actorUserId: audit.actorUserId,
        action: "EMPLOYEE_EMERGENCY_CONTACT_DELETED",
        entityType: "EmployeeEmergencyContact",
        entityId: contactId,
        oldValues: auditJson(mapContact(current)),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      }
    });
    return { id: contactId, deleted: true };
  }
};
