import { z } from "zod";

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
};

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const holidayCatalogSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(1900).max(2200).optional(),
    filter: z.enum(["public", "christian", "muslim", "religious", "cultural", "custom", "all"]).optional()
  })
});

export const holidayDetailSchema = z.object({
  params: z.object({ key: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(1900).max(2200).optional()
  })
});

export const applyHolidaySchema = z.object({
  body: z
    .object({
      kenatKey: z.string().min(1).optional(),
      holidayId: z.string().uuid().optional(),
      year: z.coerce.number().int().min(1900).max(2200).optional(),
      officeId: z.string().uuid().optional().nullable(),
      employeeIds: z.array(z.string().uuid()).max(5000).optional(),
      notify: z.boolean().optional().default(true),
      message: z.string().max(500).optional().nullable()
    })
    .refine((b) => !!b.kenatKey || !!b.holidayId, {
      message: "kenatKey or holidayId is required"
    })
});

export const createCustomHolidaySchema = z.object({
  body: z.object({
    nameEn: z.string().trim().min(1).max(200),
    nameAm: z.string().trim().max(200).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    gregorianDates: z.array(dateKey).min(1).max(14),
    linkedKenatKey: z.string().min(1).max(100).optional().nullable(),
    officeId: z.string().uuid().optional().nullable(),
    employeeIds: z.array(z.string().uuid()).max(5000).optional(),
    notify: z.boolean().optional().default(true),
    message: z.string().max(500).optional().nullable(),
    applyNow: z.boolean().optional().default(true),
    autoApply: z.boolean().optional().default(false)
  })
});

export const setHolidayAutoApplySchema = z.object({
  body: z
    .object({
      kenatKey: z.string().min(1).optional(),
      holidayId: z.string().uuid().optional(),
      year: z.coerce.number().int().min(1900).max(2200).optional(),
      autoApply: z.boolean(),
      notify: z.boolean().optional().default(true),
      message: z.string().max(500).optional().nullable(),
      officeId: z.string().uuid().optional().nullable(),
      employeeIds: z.array(z.string().uuid()).max(5000).optional()
    })
    .refine((b) => !!b.kenatKey || !!b.holidayId, {
      message: "kenatKey or holidayId is required"
    })
});

export const holidayApplicationIdSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export const myHolidaysSchema = z.object({
  query: z.object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    ...page
  })
});
