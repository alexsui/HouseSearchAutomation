import { z } from "zod";
import { assertSameOrigin } from "@/services/auth/origin";
import { verifySession, SESSION_COOKIE_NAME } from "@/services/auth/cookie";
import { upsertTriageNote } from "@/services/repositories/triage";

const Body = z.object({
  listing_id: z.string().uuid(),
  note: z.string().max(2000),
});

function sessionFrom(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? match.slice(SESSION_COOKIE_NAME.length + 1) : null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }
  const token = sessionFrom(req);
  if (!token || !(await verifySession(token))) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  await upsertTriageNote(parsed.data.listing_id, parsed.data.note);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
