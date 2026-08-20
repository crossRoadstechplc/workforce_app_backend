import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

export type AccessTokenClaims = {
  userId: string;
  roles: string[];
  permissions: string[];
  restricted: boolean;
  organizationId: string | null;
  officeIds: string[];
  typ?: "access" | "display";
  boardMode?: "ROOMS" | "PEOPLE" | "BOTH";
};

export async function signAccessToken(input: AccessTokenClaims) {
  return new SignJWT({
    typ: input.typ ?? "access",
    tokenUse: input.typ ?? "access",
    roles: input.roles,
    permissions: input.permissions,
    restricted: input.restricted,
    organizationId: input.organizationId,
    officeIds: input.officeIds,
    ...(input.boardMode ? { boardMode: input.boardMode } : {})
  })
    .setProtectedHeader({ alg: "HS256" }).setSubject(input.userId).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE)
    .setJti(randomUUID()).setIssuedAt().setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`).sign(accessKey);
}

export async function signDisplayAccessToken(input: {
  displayId: string;
  organizationId: string;
  officeId: string;
  boardMode: "ROOMS" | "PEOPLE" | "BOTH";
}) {
  return signAccessToken({
    userId: input.displayId,
    typ: "display",
    roles: [],
    permissions: ["display.view"],
    restricted: false,
    organizationId: input.organizationId,
    officeIds: [input.officeId],
    boardMode: input.boardMode
  });
}

export async function signRefreshToken(userId: string) {
  return new SignJWT({ type: "refresh" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
    .setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setJti(randomUUID()).setIssuedAt().setExpirationTime(`${env.REFRESH_TOKEN_TTL_DAYS}d`).sign(refreshKey);
}

export async function signDisplayRefreshToken(displayId: string) {
  return new SignJWT({ type: "display_refresh" }).setProtectedHeader({ alg: "HS256" }).setSubject(displayId)
    .setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setJti(randomUUID()).setIssuedAt().setExpirationTime(`${env.DISPLAY_REFRESH_TOKEN_TTL_DAYS}d`).sign(refreshKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  if (payload.tokenUse === "vault" || payload.typ === "vault") throw new Error("Vault token is not an access token");
  const typ = payload.tokenUse === "display" || payload.typ === "display" ? "display" : "access";
  return {
    userId: payload.sub!,
    roles: (payload.roles as string[]) ?? [],
    permissions: (payload.permissions as string[]) ?? [],
    restricted: Boolean(payload.restricted),
    organizationId: (payload.organizationId as string | null | undefined) ?? null,
    officeIds: (payload.officeIds as string[] | undefined) ?? [],
    typ,
    boardMode: payload.boardMode as AccessTokenClaims["boardMode"]
  };
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  if (payload.type !== "refresh" || !payload.sub) throw new Error("Invalid refresh token");
  return { userId: payload.sub };
}

export async function verifyDisplayRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
  if (payload.type !== "display_refresh" || !payload.sub) throw new Error("Invalid display refresh token");
  return { displayId: payload.sub };
}
