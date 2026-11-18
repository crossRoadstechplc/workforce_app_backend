import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const WEBHOOK_MAX_ATTEMPTS = 6;
/** Wait after attempt 1, 2, 3, 4, 5 fails. Attempt 6 failing marks the delivery FAILED. */
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

function hmacHex(secret: string, timestamp: number, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Value for the `X-Workforce-Signature` header: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "t.body")>`. */
export function signWebhookPayload(secret: string, rawBody: string, timestampSeconds = Math.floor(Date.now() / 1000)) {
  return `t=${timestampSeconds},v1=${hmacHex(secret, timestampSeconds, rawBody)}`;
}

/** Reference verifier (the receiving app implements the same logic; also used in tests and docs). */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    })
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isInteger(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(hmacHex(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Delay before the next try after `attempts` failed tries, or null when the delivery should be marked FAILED. */
export function nextRetryDelayMs(attempts: number): number | null {
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) return null;
  return WEBHOOK_RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), WEBHOOK_RETRY_DELAYS_MS.length) - 1]!;
}

/** True for loopback, private, link-local, CGNAT and unique-local addresses (SSRF protection). */
export function isPrivateAddress(address: string) {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (version === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("::ffff:")) return isPrivateAddress(ip.slice(7));
    return ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
  }
  return false;
}

/**
 * Validates a webhook URL when an admin saves it. Production requires https and a public host;
 * development also allows http://localhost so a local receiver can be used for testing.
 */
export function webhookUrlProblem(value: string, opts: { production: boolean }): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Webhook URL is not a valid URL";
  }
  if (url.username || url.password) return "Webhook URL must not contain credentials";
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host.endsWith(".localhost") || isPrivateAddress(host);
  if (opts.production) {
    if (url.protocol !== "https:") return "Webhook URL must use https";
    if (local) return "Webhook URL must point to a public server";
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return "Webhook URL must use https (http is only allowed for localhost)";
  return null;
}
