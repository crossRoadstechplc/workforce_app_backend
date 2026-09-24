import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { pageMeta } from "../../shared/pagination.js";
import { employeeOfficeFilter, getOfficeScope, type OfficeScope } from "../../shared/office-scope.js";
import { isTenantAdmin, requireOrganizationId, type AuthContext } from "../../shared/tenancy.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToUser } from "../../realtime/socket.server.js";

const employeeCardSelect = {
  id: true,
  userId: true,
  firstName: true,
  middleName: true,
  lastName: true,
  jobTitle: true,
  department: { select: { id: true, name: true } },
  employeeCode: true,
  office: { select: { id: true, name: true } }
} as const;

const participantInclude = {
  user: {
    select: {
      id: true,
      email: true,
      employee: { select: employeeCardSelect }
    }
  }
} as const;

const messageInclude = {
  sender: {
    select: {
      id: true,
      email: true,
      employee: { select: { firstName: true, middleName: true, lastName: true } }
    }
  }
} as const;

type EmployeeCard = {
  id: string;
  userId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  employeeCode: string;
  office: { id: string; name: string } | null;
};

type ChatActor = {
  userId: string;
  organizationId: string;
  displayName: string;
  isEmployee: boolean;
  isAdmin: boolean;
  officeScope: OfficeScope;
};

function personName(person: { firstName: string; middleName?: string | null; lastName: string } | null | undefined) {
  if (!person) return null;
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}

function adminLabel(email: string) {
  const local = email.split("@")[0]?.trim();
  return local ? `Admin (${local})` : "Admin";
}

function participantLabel(user: { email: string; employee: EmployeeCard | null }) {
  return personName(user.employee) ?? adminLabel(user.email);
}

function serializeEmployee(employee: EmployeeCard) {
  return {
    userId: employee.userId,
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    displayName: personName(employee)!,
    jobTitle: employee.jobTitle,
    department: employee.department?.name ?? null,
    employeeCode: employee.employeeCode,
    officeName: employee.office?.name ?? null
  };
}

function serializeMessage(row: {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  body: string | null;
  attachmentUrl: string | null;
  createdAt: Date;
  sender: { id: string; email: string; employee: { firstName: string; middleName: string | null; lastName: string } | null };
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: personName(row.sender.employee) ?? adminLabel(row.sender.email),
    type: row.type,
    body: row.body,
    attachmentUrl: row.attachmentUrl,
    createdAt: row.createdAt
  };
}

async function resolveActor(auth: AuthContext): Promise<ChatActor> {
  const organizationId = requireOrganizationId(auth);
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: {
      employee: {
        select: {
          id: true,
          status: true,
          organizationId: true,
          firstName: true,
          middleName: true,
          lastName: true
        }
      }
    }
  });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(403, "USER_INACTIVE", "Active account required");
  }
  const employee =
    user.employee &&
    user.employee.status === "ACTIVE" &&
    user.employee.organizationId === organizationId
      ? user.employee
      : null;
  const isAdmin = isTenantAdmin(auth);
  if (!employee && !isAdmin) {
    throw new AppError(403, "CHAT_FORBIDDEN", "Active employee or administrator account required");
  }
  return {
    userId: auth.userId,
    organizationId,
    displayName: personName(employee) ?? adminLabel(user.email),
    isEmployee: !!employee,
    isAdmin,
    officeScope: getOfficeScope(auth)
  };
}

function requireEmployeeActor(actor: ChatActor) {
  if (!actor.isEmployee) {
    throw new AppError(403, "EMPLOYEE_REQUIRED", "Only employees can start personal or group chats");
  }
}

function requireAdminActor(actor: ChatActor) {
  if (!actor.isAdmin) {
    throw new AppError(403, "ADMIN_REQUIRED", "Administrator access is required");
  }
}

async function requirePeer(organizationId: string, actorUserId: string, peerUserId: string, officeScope?: OfficeScope) {
  if (peerUserId === actorUserId) throw new AppError(422, "CANNOT_CHAT_SELF", "You cannot start a chat with yourself");
  const peer = await prisma.employee.findFirst({
    where: {
      userId: peerUserId,
      organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      ...(officeScope ? employeeOfficeFilter(officeScope) : {})
    },
    select: employeeCardSelect
  });
  if (!peer) throw new AppError(404, "COLLEAGUE_NOT_FOUND", "That employee is not available to chat");
  return peer;
}

function directKeyFor(userIdA: string, userIdB: string) {
  return [userIdA, userIdB].sort().join(":");
}

function adminKeyFor(userIdA: string, userIdB: string) {
  return `ADMIN:${directKeyFor(userIdA, userIdB)}`;
}

async function requireMembership(conversationId: string, userId: string) {
  const membership = await prisma.chatParticipant.findFirst({
    where: { conversationId, userId, leftAt: null },
    include: {
      conversation: {
        include: {
          participants: { where: { leftAt: null }, include: participantInclude }
        }
      }
    }
  });
  if (!membership) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  return membership;
}

async function unreadCount(conversationId: string, userId: string, lastReadAt: Date | null) {
  return prisma.chatMessage.count({
    where: {
      conversationId,
      deletedAt: null,
      senderId: { not: userId },
      createdAt: { gt: lastReadAt ?? new Date(0) }
    }
  });
}

function serializeConversation(
  conversation: {
    id: string;
    type: string;
    name: string | null;
    createdAt: Date;
    updatedAt: Date;
    participants: Array<{
      userId: string;
      role: string;
      lastReadAt: Date | null;
      user: { id: string; email: string; employee: EmployeeCard | null };
    }>;
    messages?: Array<{
      id: string;
      conversationId: string;
      senderId: string;
      type: string;
      body: string | null;
      attachmentUrl: string | null;
      createdAt: Date;
      sender: { id: string; email: string; employee: { firstName: string; middleName: string | null; lastName: string } | null };
    }>;
  },
  currentUserId: string,
  unread: number
) {
  const others = conversation.participants.filter((p) => p.userId !== currentUserId);
  const peerUser = others[0]?.user ?? null;
  const peerEmployee = peerUser?.employee ?? null;
  let title: string;
  if (conversation.type === "GROUP") {
    title = conversation.name ?? "Group";
  } else if (peerEmployee) {
    title = personName(peerEmployee)!;
  } else if (peerUser) {
    title = participantLabel(peerUser);
  } else {
    title = conversation.type === "ADMIN" ? "Admin" : "Chat";
  }
  const last = conversation.messages?.[0];
  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name,
    title,
    peer: peerEmployee ? serializeEmployee(peerEmployee) : null,
    participants: conversation.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      displayName: participantLabel(p.user),
      jobTitle: p.user.employee?.jobTitle ?? null
    })),
    lastMessage: last ? serializeMessage(last) : null,
    unreadCount: unread,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

const conversationListInclude = {
  participants: { where: { leftAt: null }, include: participantInclude },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: messageInclude
  }
};

function emitConversationUpdated(
  participants: Array<{ userId: string }>,
  payload: { conversationId: string; reason: string }
) {
  for (const participant of participants) {
    emitToUser(participant.userId, "chat.conversation.updated", payload);
  }
}

export const chatService = {
  async colleagues(auth: AuthContext, input: { page: number; pageSize: number; q?: string }) {
    const actor = await resolveActor(auth);
    const q = input.q?.trim();
    const officeFilter = actor.isAdmin && !actor.isEmployee ? employeeOfficeFilter(actor.officeScope) : {};
    const where = {
      organizationId: actor.organizationId,
      status: "ACTIVE" as const,
      userId: { not: auth.userId },
      user: { status: "ACTIVE" as const },
      ...officeFilter,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { middleName: { contains: q, mode: "insensitive" as const } },
              { employeeCode: { contains: q, mode: "insensitive" as const } },
              { jobTitle: { contains: q, mode: "insensitive" as const } },
              { department: { name: { contains: q, mode: "insensitive" as const } } }
            ]
          }
        : {})
    };
    const skip = (input.page - 1) * input.pageSize;
    const [rows, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        select: employeeCardSelect,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        skip,
        take: input.pageSize
      }),
      prisma.employee.count({ where })
    ]);
    return { items: rows.map(serializeEmployee), meta: pageMeta(input.page, input.pageSize, total) };
  },

  async listConversations(auth: AuthContext, input: { page: number; pageSize: number; type?: "DIRECT" | "GROUP" | "ADMIN" }) {
    const actor = await resolveActor(auth);
    const skip = (input.page - 1) * input.pageSize;
    const where = {
      participants: { some: { userId: actor.userId, leftAt: null } },
      ...(input.type ? { type: input.type } : {}),
      OR: [{ type: { in: ["GROUP" as const, "ADMIN" as const] } }, { messages: { some: { deletedAt: null } } }]
    };
    const [rows, total] = await prisma.$transaction([
      prisma.chatConversation.findMany({
        where,
        include: conversationListInclude,
        orderBy: { updatedAt: "desc" },
        skip,
        take: input.pageSize
      }),
      prisma.chatConversation.count({ where })
    ]);
    const items = await Promise.all(
      rows.map(async (row) => {
        const me = row.participants.find((p) => p.userId === actor.userId);
        const unread = await unreadCount(row.id, actor.userId, me?.lastReadAt ?? null);
        return serializeConversation(row, actor.userId, unread);
      })
    );
    const unreadTotal = items.reduce((sum, item) => sum + item.unreadCount, 0);
    return { items, meta: pageMeta(input.page, input.pageSize, total), unreadTotal };
  },

  async openDirect(auth: AuthContext, peerUserId: string) {
    const actor = await resolveActor(auth);
    requireEmployeeActor(actor);
    await requirePeer(actor.organizationId, actor.userId, peerUserId);
    const directKey = directKeyFor(actor.userId, peerUserId);
    const existing = await prisma.chatConversation.findFirst({
      where: { organizationId: actor.organizationId, type: "DIRECT", directKey },
      include: conversationListInclude
    });
    if (existing) {
      const me = existing.participants.find((p) => p.userId === actor.userId);
      if (!me) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
      const unread = await unreadCount(existing.id, actor.userId, me.lastReadAt);
      return serializeConversation(existing, actor.userId, unread);
    }
    const created = await prisma.chatConversation.create({
      data: {
        organizationId: actor.organizationId,
        type: "DIRECT",
        directKey,
        createdById: actor.userId,
        participants: {
          create: [
            { userId: actor.userId, role: "OWNER" },
            { userId: peerUserId, role: "MEMBER" }
          ]
        }
      },
      include: conversationListInclude
    });
    emitConversationUpdated(created.participants, { conversationId: created.id, reason: "created" });
    return serializeConversation(created, actor.userId, 0);
  },

  async openAdmin(auth: AuthContext, employeeUserId: string) {
    const actor = await resolveActor(auth);
    requireAdminActor(actor);
    await requirePeer(actor.organizationId, actor.userId, employeeUserId, actor.officeScope);
    const directKey = adminKeyFor(actor.userId, employeeUserId);
    const existing = await prisma.chatConversation.findFirst({
      where: { organizationId: actor.organizationId, type: "ADMIN", directKey },
      include: conversationListInclude
    });
    if (existing) {
      const me = existing.participants.find((p) => p.userId === actor.userId);
      if (!me) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
      const unread = await unreadCount(existing.id, actor.userId, me.lastReadAt);
      return serializeConversation(existing, actor.userId, unread);
    }
    const created = await prisma.chatConversation.create({
      data: {
        organizationId: actor.organizationId,
        type: "ADMIN",
        directKey,
        createdById: actor.userId,
        participants: {
          create: [
            { userId: actor.userId, role: "OWNER" },
            { userId: employeeUserId, role: "MEMBER" }
          ]
        }
      },
      include: conversationListInclude
    });
    emitConversationUpdated(created.participants, { conversationId: created.id, reason: "created" });
    return serializeConversation(created, actor.userId, 0);
  },

  async createGroup(auth: AuthContext, input: { name: string; memberUserIds: string[] }) {
    const actor = await resolveActor(auth);
    requireEmployeeActor(actor);
    const uniqueIds = [...new Set(input.memberUserIds.filter((id) => id !== actor.userId))];
    for (const peerId of uniqueIds) {
      await requirePeer(actor.organizationId, actor.userId, peerId);
    }
    const created = await prisma.chatConversation.create({
      data: {
        organizationId: actor.organizationId,
        type: "GROUP",
        name: input.name.trim(),
        createdById: actor.userId,
        participants: {
          create: [
            { userId: actor.userId, role: "OWNER" },
            ...uniqueIds.map((userId) => ({ userId, role: "MEMBER" as const }))
          ]
        }
      },
      include: conversationListInclude
    });
    emitConversationUpdated(created.participants, { conversationId: created.id, reason: "created" });
    return serializeConversation(created, actor.userId, 0);
  },

  async renameGroup(auth: AuthContext, conversationId: string, name: string) {
    const actor = await resolveActor(auth);
    const membership = await requireMembership(conversationId, actor.userId);
    if (membership.conversation.type !== "GROUP") {
      throw new AppError(422, "NOT_A_GROUP", "Only group chats can be renamed");
    }
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only group owners or admins can rename the group");
    }
    const updated = await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { name: name.trim() },
      include: conversationListInclude
    });
    emitConversationUpdated(updated.participants, { conversationId, reason: "renamed" });
    const unread = await unreadCount(conversationId, actor.userId, membership.lastReadAt);
    return serializeConversation(updated, actor.userId, unread);
  },

  async addGroupMembers(auth: AuthContext, conversationId: string, memberUserIds: string[]) {
    const actor = await resolveActor(auth);
    const membership = await requireMembership(conversationId, actor.userId);
    if (membership.conversation.type !== "GROUP") {
      throw new AppError(422, "NOT_A_GROUP", "Only group chats support invites");
    }
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Only group owners or admins can invite members");
    }
    const activeIds = new Set(membership.conversation.participants.map((p) => p.userId));
    const toAdd = [...new Set(memberUserIds)].filter((id) => id !== actor.userId && !activeIds.has(id));
    for (const peerId of toAdd) {
      await requirePeer(actor.organizationId, actor.userId, peerId);
    }
    for (const userId of toAdd) {
      await prisma.chatParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        create: { conversationId, userId, role: "MEMBER" },
        update: { leftAt: null, joinedAt: new Date(), role: "MEMBER" }
      });
    }
    const updated = await prisma.chatConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: conversationListInclude
    });
    emitConversationUpdated(updated.participants, { conversationId, reason: "members_added" });
    const unread = await unreadCount(conversationId, actor.userId, membership.lastReadAt);
    return serializeConversation(updated, actor.userId, unread);
  },

  async leaveGroup(auth: AuthContext, conversationId: string) {
    const actor = await resolveActor(auth);
    const membership = await requireMembership(conversationId, actor.userId);
    if (membership.conversation.type !== "GROUP") {
      throw new AppError(422, "NOT_A_GROUP", "You can only leave group chats");
    }
    await prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId: actor.userId } },
      data: { leftAt: new Date() }
    });
    const remaining = membership.conversation.participants.filter((p) => p.userId !== actor.userId);
    emitConversationUpdated(remaining, { conversationId, reason: "member_left" });
    return { success: true };
  },

  async get(auth: AuthContext, conversationId: string) {
    const actor = await resolveActor(auth);
    const membership = await requireMembership(conversationId, actor.userId);
    const conversation = await prisma.chatConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: conversationListInclude
    });
    const unread = await unreadCount(conversationId, actor.userId, membership.lastReadAt);
    return serializeConversation(conversation, actor.userId, unread);
  },

  async listMessages(auth: AuthContext, conversationId: string, input: { page: number; pageSize: number }) {
    const actor = await resolveActor(auth);
    await requireMembership(conversationId, actor.userId);
    const skip = (input.page - 1) * input.pageSize;
    const where = { conversationId, deletedAt: null };
    const [rows, total] = await prisma.$transaction([
      prisma.chatMessage.findMany({
        where,
        include: messageInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: input.pageSize
      }),
      prisma.chatMessage.count({ where })
    ]);
    return {
      items: rows.slice().reverse().map(serializeMessage),
      meta: pageMeta(input.page, input.pageSize, total)
    };
  },

  async sendMessage(auth: AuthContext, conversationId: string, body: string) {
    const actor = await resolveActor(auth);
    const membership = await requireMembership(conversationId, actor.userId);
    const others = membership.conversation.participants.filter((p) => p.userId !== actor.userId);
    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: { conversationId, senderId: actor.userId, type: "TEXT", body },
        include: messageInclude
      });
      await tx.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId: actor.userId } },
        data: { lastReadAt: new Date() }
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });
      const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body;
      const notifications = await Promise.all(
        others.map((participant) =>
          tx.notification.create({
            data: {
              userId: participant.userId,
              type: "CHAT_MESSAGE",
              title: actor.displayName,
              message: preview,
              relatedEntityType: "ChatConversation",
              relatedEntityId: conversationId
            }
          })
        )
      );
      return { message, notifications };
    });
    const payload = serializeMessage(result.message);
    for (const participant of membership.conversation.participants) {
      emitToUser(participant.userId, "chat.message.created", { conversationId, message: payload });
    }
    for (const notification of result.notifications) await deliverNotification(notification);
    return payload;
  },

  async markRead(auth: AuthContext, conversationId: string) {
    const actor = await resolveActor(auth);
    await requireMembership(conversationId, actor.userId);
    await prisma.$transaction([
      prisma.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId: actor.userId } },
        data: { lastReadAt: new Date() }
      }),
      prisma.notification.updateMany({
        where: {
          userId: actor.userId,
          type: "CHAT_MESSAGE",
          relatedEntityType: "ChatConversation",
          relatedEntityId: conversationId,
          isRead: false
        },
        data: { isRead: true, readAt: new Date() }
      })
    ]);
    return { success: true };
  }
};
