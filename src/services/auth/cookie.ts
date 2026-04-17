import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "triage_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  issuedAt: number;
  expiresAt: number;
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SIGNING_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SIGNING_SECRET missing or too short (need >= 32 chars)");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.issuedAt !== "number" || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return { issuedAt: payload.issuedAt, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}
