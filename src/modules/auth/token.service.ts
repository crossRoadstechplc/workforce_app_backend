import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

export async function signAccessToken(input: { userId: string; roles: string[]; permissions: string[]; restricted: boolean }) {
  return new SignJWT({ roles: input.roles, permissions: input.permissions, restricted: input.restricted })
    .setProtectedHeader({ alg: "HS256" }).setSubject(input.userId).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE)
    .setJti(randomUUID()).setIssuedAt().setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`).sign(accessKey);
}
export async function signRefreshToken(userId: string) {
  return new SignJWT({ type: "refresh" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
    .setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setJti(randomUUID()).setIssuedAt().setExpirationTime(`${env.REFRESH_TOKEN_TTL_DAYS}d`).sign(refreshKey);
}
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  return { userId: payload.sub!, roles: (payload.roles as string[]) ?? [], permissions: (payload.permissions as string[]) ?? [], restricted: Boolean(payload.restricted) };
}
export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  if (payload.type !== "refresh" || !payload.sub) throw new Error("Invalid refresh token");
  return { userId: payload.sub };
}
