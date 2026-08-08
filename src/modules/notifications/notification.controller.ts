import type { RequestHandler } from "express";
import { notificationService } from "./notification.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const listNotifications: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await notificationService.list(req.auth!.userId, req.query as any) }); } catch (e) { next(e); }
};
export const markNotificationRead: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await notificationService.markRead(req.auth!.userId, paramId(req.params.notificationId!)) }); } catch (e) { next(e); }
};
export const markAllNotificationsRead: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await notificationService.markAllRead(req.auth!.userId) }); } catch (e) { next(e); }
};
export const registerDevice: RequestHandler = async (req, res, next) => {
  try { res.status(201).json({ data: await notificationService.registerDevice(req.auth!.userId, req.body) }); } catch (e) { next(e); }
};
export const removeDevice: RequestHandler = async (req, res, next) => {
  try { res.json({ data: await notificationService.removeDevice(req.auth!.userId, paramId(req.params.deviceId!)) }); } catch (e) { next(e); }
};
