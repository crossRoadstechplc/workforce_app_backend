import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { meetingService } from "./meeting.service.js";

const paramId = (value: string | string[]) => (Array.isArray(value) ? value[0]! : value);

export const listMyRooms: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.listRoomsForBooker(req.auth!, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const roomAvailability: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.availability(req.auth!, paramId(req.params.id!), String((req.query as { date: string }).date)) });
  } catch (e) {
    next(e);
  }
};

export const myBookings: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.myBookings(req.auth!, req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const createBooking: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await meetingService.createBooking(req.auth!, req.body) });
  } catch (e) {
    next(e);
  }
};

export const cancelMyBooking: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.cancelOwn(req.auth!, paramId(req.params.id!)) });
  } catch (e) {
    next(e);
  }
};

export const adminRooms: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.adminListRooms(requireOrganizationId(req.auth), req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const createRoom: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json({ data: await meetingService.createRoom(requireOrganizationId(req.auth), req.body, auditContextFromRequest(req)) });
  } catch (e) {
    next(e);
  }
};

export const updateRoom: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.updateRoom(requireOrganizationId(req.auth), paramId(req.params.id!), req.body, auditContextFromRequest(req)) });
  } catch (e) {
    next(e);
  }
};

export const adminBookings: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await meetingService.adminListBookings(requireOrganizationId(req.auth), req.query as never) });
  } catch (e) {
    next(e);
  }
};

export const rescheduleBooking: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await meetingService.reschedule(
        requireOrganizationId(req.auth),
        req.auth!.userId,
        paramId(req.params.id!),
        req.body,
        auditContextFromRequest(req)
      )
    });
  } catch (e) {
    next(e);
  }
};

export const adminCancelBooking: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await meetingService.adminCancel(requireOrganizationId(req.auth), req.auth!.userId, paramId(req.params.id!), auditContextFromRequest(req))
    });
  } catch (e) {
    next(e);
  }
};
