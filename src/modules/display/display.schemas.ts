import { z } from "zod";

const uuid = z.string().uuid();

export const createDisplaySchema = z.object({
  body: z.object({
    officeId: uuid,
    name: z.string().trim().min(2).max(80),
    boardMode: z.enum(["ROOMS", "PEOPLE", "BOTH"]).default("BOTH")
  })
});

export const displayIdSchema = z.object({
  params: z.object({ id: uuid })
});

export const pairDisplaySchema = z.object({
  body: z.object({
    code: z.string().trim().regex(/^\d{6}$/, "Pairing code must be 6 digits")
  })
});

export const refreshDisplaySchema = z.object({
  body: z.object({
    refreshToken: z.string().min(20)
  })
});

export const roomsBoardSchema = z.object({
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
});
