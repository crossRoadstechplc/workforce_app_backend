import type { RequestHandler } from "express";
import { chatService } from "./chat.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const listColleagues: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.colleagues(req.auth!.userId, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const listConversations: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.listConversations(req.auth!.userId, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const openDirect: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await chatService.openDirect(req.auth!.userId, req.body.userId) });
  } catch (e) {
    next(e);
  }
};

export const getConversation: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.get(req.auth!.userId, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const listMessages: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.listMessages(req.auth!.userId, paramId(req.params.id!), req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const sendMessage: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await chatService.sendMessage(req.auth!.userId, paramId(req.params.id!), req.body.body) });
  } catch (e) {
    next(e);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await chatService.markRead(req.auth!.userId, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};
