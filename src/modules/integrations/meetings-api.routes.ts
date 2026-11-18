import { Router, type Request, type RequestHandler } from "express";
import { apiKeyRateLimit, authenticateApiKey } from "../../middleware/authenticate-api-key.js";
import { validate } from "../../shared/validate.js";
import {
  apiAvailabilitySchema,
  apiBookingIdSchema,
  apiCancelBookingSchema,
  apiCreateBookingSchema,
  apiEmployeeSchema,
  apiListBookingsSchema,
  apiListRoomsSchema,
  apiRescheduleBookingSchema
} from "./meetings-api.schemas.js";
import { meetingsApiService } from "./meetings-api.service.js";

const ctx = (req: Request) => req.integration!;
const param = (req: Request, key: string) => {
  const value = req.params[key];
  return Array.isArray(value) ? value[0]! : value!;
};
const handle =
  (fn: (req: Request) => Promise<{ status?: number; data: unknown }>): RequestHandler =>
  async (req, res, next) => {
    try {
      const result = await fn(req);
      res.status(result.status ?? 200).json({ data: result.data });
    } catch (error) {
      next(error);
    }
  };

/** External, server-to-server meeting booking API. Auth: `X-API-Key`. Mounted at /api/v1/integrations/meetings. */
export const integrationMeetingRouter = Router();
integrationMeetingRouter.use(authenticateApiKey, apiKeyRateLimit);

integrationMeetingRouter.get(
  "/rooms",
  validate(apiListRoomsSchema),
  handle(async (req) => ({ data: await meetingsApiService.listRooms(ctx(req), req.query as never) }))
);
integrationMeetingRouter.get(
  "/rooms/:roomId/availability",
  validate(apiAvailabilitySchema),
  handle(async (req) => ({
    data: await meetingsApiService.availability(ctx(req), param(req, "roomId"), String((req.query as { date: string }).date))
  }))
);
integrationMeetingRouter.get(
  "/employees/:employeeCode",
  validate(apiEmployeeSchema),
  handle(async (req) => ({ data: await meetingsApiService.employee(ctx(req), param(req, "employeeCode")) }))
);
integrationMeetingRouter.get(
  "/bookings",
  validate(apiListBookingsSchema),
  handle(async (req) => ({ data: await meetingsApiService.listBookings(ctx(req), req.query as never) }))
);
integrationMeetingRouter.post(
  "/bookings",
  validate(apiCreateBookingSchema),
  handle(async (req) => {
    const result = await meetingsApiService.createBooking(ctx(req), req.body);
    // 201 for a new booking, 200 when the same externalId was replayed.
    return { status: result.created ? 201 : 200, data: result.booking };
  })
);
integrationMeetingRouter.get(
  "/bookings/:id",
  validate(apiBookingIdSchema),
  handle(async (req) => ({ data: await meetingsApiService.getBooking(ctx(req), param(req, "id")) }))
);
integrationMeetingRouter.patch(
  "/bookings/:id",
  validate(apiRescheduleBookingSchema),
  handle(async (req) => ({ data: await meetingsApiService.reschedule(ctx(req), param(req, "id"), req.body) }))
);
integrationMeetingRouter.post(
  "/bookings/:id/cancel",
  validate(apiCancelBookingSchema),
  handle(async (req) => ({
    data: await meetingsApiService.cancel(ctx(req), param(req, "id"), (req.body as { reason?: string } | undefined)?.reason)
  }))
);
