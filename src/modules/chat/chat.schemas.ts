import { z } from "zod";

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

export const listColleaguesSchema = z.object({
  query: z.object({
    ...page,
    q: z.string().trim().max(80).optional()
  })
});

export const listConversationsSchema = z.object({
  query: z.object({ ...page })
});

export const openDirectSchema = z.object({
  body: z.object({
    userId: z.string().uuid()
  })
});

export const conversationIdSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export const listMessagesSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ ...page })
});

export const sendMessageSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    body: z.string().trim().min(1).max(4000)
  })
});
