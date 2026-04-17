import { SESSION_COOKIE_NAME } from "@/services/auth/cookie";
import { assertSameOrigin } from "@/services/auth/origin";

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }
  const cookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
}
