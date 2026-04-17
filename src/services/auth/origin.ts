import { loadServerEnv } from "@/config/env";

export function assertSameOrigin(req: Request): void {
  const allowed = loadServerEnv().NEXT_PUBLIC_SITE_URL;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== allowed) throw new Error(`invalid origin: ${origin}`);
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    const refererOrigin = new URL(referer).origin;
    if (refererOrigin !== allowed) throw new Error(`invalid referer: ${refererOrigin}`);
    return;
  }
  throw new Error("missing Origin or Referer header");
}
