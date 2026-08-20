import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { env } from "../../config/env.js";
import type { VaultScope } from "./vault-token.js";

const pinByScope: Record<VaultScope, string> = {
  credentials: env.VAULT_CREDENTIALS_PIN,
  subscriptions: env.VAULT_SUBSCRIPTION_PIN,
  reveal: env.VAULT_REVEAL_PIN
};

const hashCache: Partial<Record<VaultScope, string>> = {};

async function hashFor(scope: VaultScope) {
  if (!hashCache[scope]) {
    hashCache[scope] = await argon2.hash(pinByScope[scope], { type: argon2.argon2id });
  }
  return hashCache[scope]!;
}

export async function verifyVaultPin(scope: VaultScope, pin: string) {
  const hash = await hashFor(scope);
  return argon2.verify(hash, pin);
}

function encryptionKey() {
  return Buffer.from(env.VAULT_ENCRYPTION_KEY, "hex");
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

export function maskSecret(plain: string) {
  if (!plain) return { secretMasked: "••••", hasSecret: false };
  const hint = plain.length >= 2 ? plain.slice(-2) : plain;
  return { secretMasked: `••••${hint}`, hasSecret: true };
}
