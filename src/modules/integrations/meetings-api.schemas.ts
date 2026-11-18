import { z } from "zod";

const uuid = z.string().uuid();
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};
/** ISO 8601 with an explicit timezone offset or Z, e.g. 2026-11-20T10:00:00+03:00. */
const instant = z.iso
  .datetime({ offset: true, message: "Use ISO 8601 with a timezone offset, e.g. 2026-11-20T10:00:00+03:00" })
  .transform((value) => new Date(value));
const employeeCode = z.string().trim().min(1).max(50);

export const apiListRoomsSchema = z.object({
  query: z.object({ ...page, officeId: uuid.optional() })
});

export const apiAvailabilitySchema = z.object({
  params: z.object({ roomId: uuid }),
  query: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD") })
});

export const apiEmployeeSchema = z.object({
  params: z.object({ employeeCode })
});

export const apiCreateBookingSchema = z.object({
  body: z.object({
    employeeCode,
    roomId: uuid,
    title: z.string().trim().min(2).max(200),
    notes: z.string().trim().max(2000).optional().nullable(),
    startsAt: instant,
    endsAt: instant,
    externalId: z.string().trim().min(1).max(200).optional()
  })
});

export const apiListBookingsSchema = z.object({
  query: z.object({
    ...page,
    employeeCode: employeeCode.optional(),
    status: z.enum(["BOOKED", "CANCELLED"]).optional(),
    from: instant.optional(),
    to: instant.optional(),
    externalId: z.string().trim().min(1).max(200).optional()
  })
});

export const apiBookingIdSchema = z.object({
  params: z.object({ id: uuid })
});

export const apiRescheduleBookingSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      startsAt: instant.optional(),
      endsAt: instant.optional(),
      roomId: uuid.optional(),
      title: z.string().trim().min(2).max(200).optional()
    })
    .refine((v) => v.startsAt || v.endsAt || v.roomId || v.title, { message: "Send at least one of startsAt, endsAt, roomId, title" })
});

export const apiCancelBookingSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ reason: z.string().trim().max(500).optional() }).optional()
});
