import { describe, it, expect, beforeEach } from "vitest";
import { signSession, verifySession } from "@/services/auth/cookie";

beforeEach(() => {
  process.env.SESSION_SIGNING_SECRET = "a".repeat(32);
});

describe("session cookie", () => {
  it("round-trips a valid token", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = await signSession({ issuedAt: 1000, expiresAt: future });
    const payload = await verifySession(token);
    expect(payload?.expiresAt).toBe(future);
  });

  it("rejects a token with wrong signature", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = await signSession({ issuedAt: 1000, expiresAt: future });
    const tampered = token.slice(0, -4) + "aaaa";
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession({
      issuedAt: 1000,
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });
    expect(await verifySession(token)).toBeNull();
  });
});
