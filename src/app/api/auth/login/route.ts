import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSession,
} from "@/services/auth/cookie";
import { assertSameOrigin } from "@/services/auth/origin";
import { isIpThrottled, recordAttempt } from "@/services/auth/attempts";
import { getClientIp, hashIp } from "@/services/auth/hash";
import { loadServerEnv } from "@/config/env";

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }

  const ipHash = hashIp(getClientIp(req));
  if (await isIpThrottled(ipHash)) {
    return new Response(JSON.stringify({ error: "too many attempts" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  const env = loadServerEnv();
  const ok = parsed.data.password === env.TRIAGE_PASSWORD;
  await recordAttempt(ipHash, ok);
  if (!ok) return new Response(null, { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  const token = await signSession({ issuedAt: now, expiresAt: now + SESSION_TTL_SECONDS });
  const cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
}
