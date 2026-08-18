import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  adminBookings,
  adminCancelBooking,
  adminRooms,
  cancelMyBooking,
  createBooking,
  createRoom,
  listMyRooms,
  myBookings,
  rescheduleBooking,
  roomAvailability,
  updateRoom
} from "./meeting.controller.js";
import {
  adminListBookingsSchema,
  availabilitySchema,
  bookingIdSchema,
  cancelBookingSchema,
  createBookingSchema,
  createRoomSchema,
  listMyBookingsSchema,
  listRoomsSchema,
  rescheduleBookingSchema,
  roomIdSchema,
  updateRoomSchema
} from "./meeting.schemas.js";

export const meetingRouter = Router();
meetingRouter.use(authenticate, requireNormalSession);
meetingRouter.get("/rooms", requirePermission("meeting.book"), validate(listRoomsSchema), listMyRooms);
meetingRouter.get("/rooms/:id/availability", requirePermission("meeting.book"), validate(availabilitySchema), roomAvailability);
meetingRouter.get("/bookings", requirePermission("meeting.view_own"), validate(listMyBookingsSchema), myBookings);
meetingRouter.post("/bookings", requirePermission("meeting.book"), validate(createBookingSchema), createBooking);
meetingRouter.post("/bookings/:id/cancel", requirePermission("meeting.book"), validate(cancelBookingSchema), cancelMyBooking);

export const adminMeetingRouter = Router();
adminMeetingRouter.use(authenticate, requireNormalSession, requireOrgContext, requireOrgAdmin);
adminMeetingRouter.get("/rooms", requirePermission("meeting.room.manage"), validate(listRoomsSchema), adminRooms);
adminMeetingRouter.post("/rooms", requirePermission("meeting.room.manage"), validate(createRoomSchema), createRoom);
adminMeetingRouter.patch("/rooms/:id", requirePermission("meeting.room.manage"), validate(updateRoomSchema), updateRoom);
adminMeetingRouter.get("/bookings", requirePermission("meeting.manage"), validate(adminListBookingsSchema), adminBookings);
adminMeetingRouter.patch("/bookings/:id", requirePermission("meeting.manage"), validate(rescheduleBookingSchema), rescheduleBooking);
adminMeetingRouter.post("/bookings/:id/cancel", requirePermission("meeting.manage"), validate(bookingIdSchema), adminCancelBooking);
