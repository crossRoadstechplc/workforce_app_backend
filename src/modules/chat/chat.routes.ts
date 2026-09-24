import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission, requireTenantAdmin } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  addGroupMembersSchema,
  conversationIdSchema,
  createGroupSchema,
  listColleaguesSchema,
  listConversationsSchema,
  listMessagesSchema,
  openAdminSchema,
  openDirectSchema,
  renameGroupSchema,
  sendMessageSchema
} from "./chat.schemas.js";
import {
  addGroupMembers,
  createGroup,
  getConversation,
  leaveGroup,
  listColleagues,
  listConversations,
  listMessages,
  markRead,
  openAdmin,
  openDirect,
  renameGroup,
  sendMessage
} from "./chat.controller.js";

export const chatRouter = Router();
chatRouter.use(authenticate, requireNormalSession, requirePermission("chat.use"));

chatRouter.get("/colleagues", validate(listColleaguesSchema), listColleagues);
chatRouter.get("/conversations", validate(listConversationsSchema), listConversations);
chatRouter.post("/conversations", validate(openDirectSchema), openDirect);
chatRouter.post("/admin/conversations", requireTenantAdmin, validate(openAdminSchema), openAdmin);
chatRouter.post("/groups", validate(createGroupSchema), createGroup);
chatRouter.patch("/groups/:id", validate(renameGroupSchema), renameGroup);
chatRouter.post("/groups/:id/members", validate(addGroupMembersSchema), addGroupMembers);
chatRouter.post("/groups/:id/leave", validate(conversationIdSchema), leaveGroup);
chatRouter.get("/conversations/:id", validate(conversationIdSchema), getConversation);
chatRouter.get("/conversations/:id/messages", validate(listMessagesSchema), listMessages);
chatRouter.post("/conversations/:id/messages", validate(sendMessageSchema), sendMessage);
chatRouter.post("/conversations/:id/read", validate(conversationIdSchema), markRead);
