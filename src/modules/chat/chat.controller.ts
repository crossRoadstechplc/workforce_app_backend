import type { RequestHandler } from "express";
import { chatService } from "./chat.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const listColleagues: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.colleagues(req.auth!, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const listConversations: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.listConversations(req.auth!, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const openDirect: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await chatService.openDirect(req.auth!, req.body.userId) });
  } catch (e) {
    next(e);
  }
};

export const openAdmin: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await chatService.openAdmin(req.auth!, req.body.userId) });
  } catch (e) {
    next(e);
  }
};

export const createGroup: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await chatService.createGroup(req.auth!, req.body) });
  } catch (e) {
    next(e);
  }
};

export const renameGroup: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.renameGroup(req.auth!, paramId(req.params.id!), req.body.name) });
  } catch (e) {
    next(e);
  }
};

export const addGroupMembers: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await chatService.addGroupMembers(req.auth!, paramId(req.params.id!), req.body.memberUserIds)
    });
  } catch (e) {
    next(e);
  }
};

export const leaveGroup: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.leaveGroup(req.auth!, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const getConversation: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.get(req.auth!, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const listMessages: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.listMessages(req.auth!, paramId(req.params.id!), req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const sendMessage: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await chatService.sendMessage(req.auth!, paramId(req.params.id!), req.body.body) });
  } catch (e) {
    next(e);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.markRead(req.auth!, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};
