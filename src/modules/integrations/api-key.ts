import { createHash, randomBytes } from "node:crypto";

/**
 * Integration API keys look like `wfk_live_<8 hex prefix>_<32 url-safe chars>`.
 * Only the SHA-256 hash is stored (same algorithm as `hashToken` in auth/token.service);
 * the prefix is stored separately so admins can recognise a key without seeing it.
 */
export const API_KEY_NAMESPACE = "wfk_live_";
const API_KEY_PATTERN = /^wfk_live_([0-9a-f]{8})_([A-Za-z0-9_-]{32})$/;

export function generateApiKey() {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const apiKey = `${API_KEY_NAMESPACE}${prefix}_${secret}`;
  return { apiKey, prefix, hash: hashApiKey(apiKey) };
}

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function parseApiKey(value: string | undefined | null) {
  const match = value?.trim().match(API_KEY_PATTERN);
  return match ? { apiKey: match[0], prefix: match[1]! } : null;
}

/** Safe-to-show form, e.g. `wfk_live_ab12cd34_…`. */
export function apiKeyPreview(prefix: string) {
  return `${API_KEY_NAMESPACE}${prefix}_…`;
}
