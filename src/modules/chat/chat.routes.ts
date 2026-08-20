import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  conversationIdSchema,
  listColleaguesSchema,
  listConversationsSchema,
  listMessagesSchema,
  openDirectSchema,
  sendMessageSchema
} from "./chat.schemas.js";
import {
  getConversation,
  listColleagues,
  listConversations,
  listMessages,
  markRead,
  openDirect,
  sendMessage
} from "./chat.controller.js";

export const chatRouter = Router();
chatRouter.use(authenticate, requireNormalSession, requirePermission("chat.use"));
chatRouter.get("/colleagues", validate(listColleaguesSchema), listColleagues);
chatRouter.get("/conversations", validate(listConversationsSchema), listConversations);
chatRouter.post("/conversations", validate(openDirectSchema), openDirect);
chatRouter.get("/conversations/:id", validate(conversationIdSchema), getConversation);
chatRouter.get("/conversations/:id/messages", validate(listMessagesSchema), listMessages);
chatRouter.post("/conversations/:id/messages", validate(sendMessageSchema), sendMessage);
chatRouter.post("/conversations/:id/read", validate(conversationIdSchema), markRead);
