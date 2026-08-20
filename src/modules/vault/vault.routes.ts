import type { RequestHandler } from "express";
import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { AppError } from "../../shared/errors/app-error.js";
import { validate } from "../../shared/validate.js";
import {
  createCredential,
  createSubscription,
  deleteCredential,
  deleteSubscription,
  listCredentials,
  listSubscriptions,
  revealCredential,
  subscriptionSummary,
  unlockVault,
  updateCredential,
  updateSubscription,
  upsertPeriod
} from "./vault.controller.js";
import {
  credentialIdSchema,
  credentialListSchema,
  createCredentialSchema,
  createSubscriptionSchema,
  subscriptionIdSchema,
  subscriptionListSchema,
  unlockSchema,
  updateCredentialSchema,
  updateSubscriptionSchema,
  upsertPeriodSchema
} from "./vault.schemas.js";
import { verifyVaultToken, type VaultScope } from "./vault-token.js";

const requireVaultScope = (scope: VaultScope): RequestHandler => async (req, _res, next) => {
  const raw = req.header("x-vault-token");
  if (!raw) return next(new AppError(401, "VAULT_TOKEN_REQUIRED", "Unlock the private vault first"));
  try {
    const vault = await verifyVaultToken(raw);
    if (vault.userId !== req.auth?.userId || vault.organizationId !== req.auth.organizationId) {
      return next(new AppError(401, "VAULT_TOKEN_EXPIRED", "Vault session is invalid"));
    }
    if (vault.scope !== scope) {
      return next(new AppError(403, "VAULT_SCOPE_REQUIRED", "This vault PIN does not unlock this section"));
    }
    req.vault = vault;
    next();
  } catch {
    next(new AppError(401, "VAULT_TOKEN_EXPIRED", "Vault session expired. Unlock again."));
  }
};

export const vaultRouter = Router();
vaultRouter.use(authenticate, requireNormalSession, requireOrgContext, requireOrgAdmin, requirePermission("vault.manage"));

vaultRouter.post("/unlock", validate(unlockSchema), unlockVault);

vaultRouter.get("/credentials", requireVaultScope("credentials"), validate(credentialListSchema), listCredentials);
vaultRouter.post("/credentials", requireVaultScope("credentials"), validate(createCredentialSchema), createCredential);
vaultRouter.patch("/credentials/:id", requireVaultScope("credentials"), validate(updateCredentialSchema), updateCredential);
vaultRouter.delete("/credentials/:id", requireVaultScope("credentials"), validate(credentialIdSchema), deleteCredential);
vaultRouter.post("/credentials/:id/reveal", requireVaultScope("reveal"), validate(credentialIdSchema), revealCredential);

vaultRouter.get("/subscriptions/summary", requireVaultScope("subscriptions"), subscriptionSummary);
vaultRouter.get("/subscriptions", requireVaultScope("subscriptions"), validate(subscriptionListSchema), listSubscriptions);
vaultRouter.post("/subscriptions", requireVaultScope("subscriptions"), validate(createSubscriptionSchema), createSubscription);
vaultRouter.patch("/subscriptions/:id", requireVaultScope("subscriptions"), validate(updateSubscriptionSchema), updateSubscription);
vaultRouter.delete("/subscriptions/:id", requireVaultScope("subscriptions"), validate(subscriptionIdSchema), deleteSubscription);
vaultRouter.put("/subscriptions/:id/periods/:yearMonth", requireVaultScope("subscriptions"), validate(upsertPeriodSchema), upsertPeriod);
