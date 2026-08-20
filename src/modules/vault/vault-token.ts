import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

export const VAULT_SCOPES = ["credentials", "subscriptions", "reveal"] as const;
export type VaultScope = (typeof VAULT_SCOPES)[number];

export type VaultTokenClaims = {
  userId: string;
  organizationId: string;
  scope: VaultScope;
};

const vaultKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signVaultToken(input: VaultTokenClaims) {
  return new SignJWT({
    typ: "vault",
    tokenUse: "vault",
    organizationId: input.organizationId,
    scope: input.scope
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${env.VAULT_TOKEN_TTL_MINUTES}m`)
    .sign(vaultKey);
}

export async function verifyVaultToken(token: string): Promise<VaultTokenClaims> {
  const { payload } = await jwtVerify(token, vaultKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  if (payload.tokenUse !== "vault" && payload.typ !== "vault") throw new Error("Not a vault token");
  const scope = payload.scope as VaultScope;
  if (!VAULT_SCOPES.includes(scope)) throw new Error("Invalid vault scope");
  if (!payload.sub || typeof payload.organizationId !== "string") throw new Error("Invalid vault token");
  return { userId: payload.sub, organizationId: payload.organizationId, scope };
}
