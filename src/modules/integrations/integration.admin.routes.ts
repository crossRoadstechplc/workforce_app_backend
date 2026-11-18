import { Router, type Request, type RequestHandler } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext } from "../../middleware/authenticate.js";
import { auditContextFromRequest } from "../../shared/audit.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { validate } from "../../shared/validate.js";
import {
  createIntegrationSchema,
  deliveryIdSchema,
  integrationIdSchema,
  listDeliveriesSchema,
  updateIntegrationSchema
} from "./integration.admin.schemas.js";
import { integrationAdminService } from "./integration.admin.service.js";

const org = (req: Request) => requireOrganizationId(req.auth);
const param = (req: Request, key: string) => {
  const value = req.params[key];
  return Array.isArray(value) ? value[0]! : value!;
};
const handle =
  (fn: (req: Request) => Promise<unknown>, status = 200): RequestHandler =>
  async (req, res, next) => {
    try {
      res.status(status).json({ data: await fn(req) });
    } catch (error) {
      next(error);
    }
  };

/** Company admins manage API keys / webhooks for external apps. Mounted at /api/v1/admin/integrations. */
export const adminIntegrationRouter = Router();
adminIntegrationRouter.use(authenticate, requireNormalSession, requireOrgContext, requireOrgAdmin);

adminIntegrationRouter.get("/", handle((req) => integrationAdminService.list(org(req))));
adminIntegrationRouter.post(
  "/",
  validate(createIntegrationSchema),
  handle((req) => integrationAdminService.create(org(req), req.body, auditContextFromRequest(req)), 201)
);
adminIntegrationRouter.patch(
  "/:id",
  validate(updateIntegrationSchema),
  handle((req) => integrationAdminService.update(org(req), param(req, "id"), req.body, auditContextFromRequest(req)))
);
adminIntegrationRouter.post(
  "/:id/rotate-key",
  validate(integrationIdSchema),
  handle((req) => integrationAdminService.rotateKey(org(req), param(req, "id"), auditContextFromRequest(req)))
);
adminIntegrationRouter.post(
  "/:id/rotate-webhook-secret",
  validate(integrationIdSchema),
  handle((req) => integrationAdminService.rotateWebhookSecret(org(req), param(req, "id"), auditContextFromRequest(req)))
);
adminIntegrationRouter.post(
  "/:id/revoke",
  validate(integrationIdSchema),
  handle((req) => integrationAdminService.revoke(org(req), param(req, "id"), auditContextFromRequest(req)))
);
adminIntegrationRouter.post(
  "/:id/test-webhook",
  validate(integrationIdSchema),
  handle((req) => integrationAdminService.testWebhook(org(req), param(req, "id")))
);
adminIntegrationRouter.get(
  "/:id/deliveries",
  validate(listDeliveriesSchema),
  handle((req) => integrationAdminService.deliveries(org(req), param(req, "id"), req.query as never))
);
adminIntegrationRouter.post(
  "/deliveries/:deliveryId/retry",
  validate(deliveryIdSchema),
  handle((req) => integrationAdminService.retryDelivery(org(req), param(req, "deliveryId"), auditContextFromRequest(req)))
);
