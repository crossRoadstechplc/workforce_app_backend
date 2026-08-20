import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { pageMeta } from "../../shared/pagination.js";
import { deliverNotification } from "../notifications/notification.service.js";
import { emitToUser } from "../../realtime/socket.server.js";

const employeeCardSelect = {
  id: true,
  userId: true,
  firstName: true,
  middleName: true,
  lastName: true,
  jobTitle: true,
  department: true,
  employeeCode: true,
  office: { select: { id: true, name: true } }
} as const;

const participantInclude = {
  user: {
    select: {
      id: true,
      employee: { select: employeeCardSelect }
    }
  }
} as const;

const messageInclude = {
  sender: {
    select: {
      id: true,
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
  department: string | null;
  employeeCode: string;
  office: { id: string; name: string } | null;
};

function displayName(person: { firstName: string; middleName?: string | null; lastName: string } | null | undefined) {
  if (!person) return "Employee";
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}

function serializeEmployee(employee: EmployeeCard) {
  return {
    userId: employee.userId,
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    displayName: displayName(employee),
    jobTitle: employee.jobTitle,
    department: employee.department,
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
  sender: { id: string; employee: { firstName: string; middleName: string | null; lastName: string } | null };
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: displayName(row.sender.employee),
    type: row.type,
    body: row.body,
    attachmentUrl: row.attachmentUrl,
    createdAt: row.createdAt
  };
}

async function chatActor(userId: string) {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, status: true } },
      office: { select: { id: true, name: true } }
    }
  });
  if (!employee || employee.status !== "ACTIVE" || employee.user.status !== "ACTIVE") {
    throw new AppError(403, "EMPLOYEE_INACTIVE", "Active employee account required");
  }
  return employee;
}

async function requirePeer(organizationId: string, actorUserId: string, peerUserId: string) {
  if (peerUserId === actorUserId) throw new AppError(422, "CANNOT_CHAT_SELF", "You cannot start a chat with yourself");
  const peer = await prisma.employee.findFirst({
    where: {
      userId: peerUserId,
      organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" }
    },
    select: employeeCardSelect
  });
  if (!peer) throw new AppError(404, "COLLEAGUE_NOT_FOUND", "That employee is not available to chat");
  return peer;
}

function directKeyFor(userIdA: string, userIdB: string) {
  return [userIdA, userIdB].sort().join(":");
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
      user: { id: string; employee: EmployeeCard | null };
    }>;
    messages?: Array<{
      id: string;
      conversationId: string;
      senderId: string;
      type: string;
      body: string | null;
      attachmentUrl: string | null;
      createdAt: Date;
      sender: { id: string; employee: { firstName: string; middleName: string | null; lastName: string } | null };
    }>;
  },
  currentUserId: string,
  unread: number
) {
  const others = conversation.participants.filter((p) => p.userId !== currentUserId);
  const peerEmployee = others[0]?.user.employee ?? null;
  const title = conversation.type === "GROUP"
    ? (conversation.name ?? "Group")
    : peerEmployee
      ? displayName(peerEmployee)
      : "Chat";
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
      displayName: p.user.employee ? displayName(p.user.employee) : "Employee",
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

export const chatService = {
  async colleagues(userId: string, input: { page: number; pageSize: number; q?: string }) {
    const actor = await chatActor(userId);
    const q = input.q?.trim();
    const where = {
      organizationId: actor.organizationId,
      status: "ACTIVE" as const,
      userId: { not: userId },
      user: { status: "ACTIVE" as const },
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { middleName: { contains: q, mode: "insensitive" as const } },
              { employeeCode: { contains: q, mode: "insensitive" as const } },
              { jobTitle: { contains: q, mode: "insensitive" as const } },
              { department: { contains: q, mode: "insensitive" as const } }
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

  async listConversations(userId: string, input: { page: number; pageSize: number }) {
    await chatActor(userId);
    const skip = (input.page - 1) * input.pageSize;
    const where = {
      participants: { some: { userId, leftAt: null } },
      messages: { some: { deletedAt: null } }
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
        const me = row.participants.find((p) => p.userId === userId);
        const unread = await unreadCount(row.id, userId, me?.lastReadAt ?? null);
        return serializeConversation(row, userId, unread);
      })
    );
    const unreadTotal = items.reduce((sum, item) => sum + item.unreadCount, 0);
    return { items, meta: pageMeta(input.page, input.pageSize, total), unreadTotal };
  },

  async openDirect(userId: string, peerUserId: string) {
    const actor = await chatActor(userId);
    await requirePeer(actor.organizationId, userId, peerUserId);
    const directKey = directKeyFor(userId, peerUserId);
    const existing = await prisma.chatConversation.findFirst({
      where: { organizationId: actor.organizationId, type: "DIRECT", directKey },
      include: conversationListInclude
    });
    if (existing) {
      const me = existing.participants.find((p) => p.userId === userId);
      if (!me) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
      const unread = await unreadCount(existing.id, userId, me.lastReadAt);
      return serializeConversation(existing, userId, unread);
    }
    const created = await prisma.chatConversation.create({
      data: {
        organizationId: actor.organizationId,
        type: "DIRECT",
        directKey,
        createdById: userId,
        participants: {
          create: [
            { userId, role: "OWNER" },
            { userId: peerUserId, role: "MEMBER" }
          ]
        }
      },
      include: conversationListInclude
    });
    return serializeConversation(created, userId, 0);
  },

  async get(userId: string, conversationId: string) {
    await chatActor(userId);
    const membership = await requireMembership(conversationId, userId);
    const conversation = await prisma.chatConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: conversationListInclude
    });
    const unread = await unreadCount(conversationId, userId, membership.lastReadAt);
    return serializeConversation(conversation, userId, unread);
  },

  async listMessages(userId: string, conversationId: string, input: { page: number; pageSize: number }) {
    await chatActor(userId);
    await requireMembership(conversationId, userId);
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

  async sendMessage(userId: string, conversationId: string, body: string) {
    const actor = await chatActor(userId);
    const membership = await requireMembership(conversationId, userId);
    const others = membership.conversation.participants.filter((p) => p.userId !== userId);
    const result = await prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: { conversationId, senderId: userId, type: "TEXT", body },
        include: messageInclude
      });
      await tx.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: new Date() }
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });
      const senderName = displayName(actor);
      const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body;
      const notifications = await Promise.all(
        others.map((participant) =>
          tx.notification.create({
            data: {
              userId: participant.userId,
              type: "CHAT_MESSAGE",
              title: senderName,
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

  async markRead(userId: string, conversationId: string) {
    await chatActor(userId);
    await requireMembership(conversationId, userId);
    await prisma.$transaction([
      prisma.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: new Date() }
      }),
      prisma.notification.updateMany({
        where: {
          userId,
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
