import { z } from "zod";

const uuid = z.string().uuid();
const name = z.string().trim().min(2).max(120);
const officeIds = z.array(uuid).max(200);
const webhookUrl = z.string().trim().url().max(2000);

export const integrationIdSchema = z.object({ params: z.object({ id: uuid }) });

export const createIntegrationSchema = z.object({
  body: z.object({
    name,
    /** Empty array = all offices. */
    officeIds: officeIds.default([]),
    webhookUrl: webhookUrl.optional().nullable()
  })
});

export const updateIntegrationSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      name: name.optional(),
      officeIds: officeIds.optional(),
      /** null removes the webhook. */
      webhookUrl: webhookUrl.optional().nullable(),
      isActive: z.boolean().optional()
    })
    .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" })
});

export const listDeliveriesSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  })
});

export const deliveryIdSchema = z.object({ params: z.object({ deliveryId: uuid }) });
