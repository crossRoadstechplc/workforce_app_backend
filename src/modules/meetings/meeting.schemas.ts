import { z } from "zod";

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
};

const uuid = z.string().uuid();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const roomIdSchema = z.object({ params: z.object({ id: uuid }) });
export const bookingIdSchema = z.object({ params: z.object({ id: uuid }) });

export const listRoomsSchema = z.object({
  query: z.object({
    ...page,
    officeId: uuid.optional(),
    isActive: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true"))
  })
});

export const createRoomSchema = z.object({
  body: z.object({
    officeId: uuid,
    name: z.string().trim().min(2).max(120),
    location: z.string().trim().max(200).optional().nullable(),
    capacity: z.coerce.number().int().min(1).max(200).default(4),
    amenities: z.array(z.string().trim().min(1).max(60)).max(20).optional()
  })
});

export const updateRoomSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    location: z.string().trim().max(200).optional().nullable(),
    capacity: z.coerce.number().int().min(1).max(200).optional(),
    amenities: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    isActive: z.boolean().optional()
  })
});

export const availabilitySchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({ date: dateString })
});

export const listMyBookingsSchema = z.object({
  query: z.object({
    ...page,
    status: z.enum(["BOOKED", "CANCELLED"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
});

export const createBookingSchema = z.object({
  body: z.object({
    roomId: uuid,
    title: z.string().trim().min(2).max(200),
    notes: z.string().trim().max(2000).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date()
  })
});

export const cancelBookingSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ reason: z.string().trim().max(500).optional() }).optional()
});

export const adminListBookingsSchema = z.object({
  query: z.object({
    ...page,
    officeId: uuid.optional(),
    roomId: uuid.optional(),
    status: z.enum(["BOOKED", "CANCELLED"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().trim().max(100).optional()
  })
});

export const rescheduleBookingSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    roomId: uuid.optional(),
    title: z.string().trim().min(2).max(200).optional()
  })
});
