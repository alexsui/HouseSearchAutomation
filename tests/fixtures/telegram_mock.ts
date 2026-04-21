import { vi } from "vitest";

const TELEGRAM_URL_RE = /^https:\/\/api\.telegram\.org\/bot[^/]+\/sendMessage$/;

function wrap(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const realFetch = globalThis.fetch;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (TELEGRAM_URL_RE.test(url)) return handler(url, init);
    return realFetch(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function mockFetchOk(): ReturnType<typeof vi.fn> {
  return wrap(
    () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

export function mockFetchFail(
  status = 500,
  body: Record<string, unknown> = { ok: false, description: "err" },
): ReturnType<typeof vi.fn> {
  return wrap(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

export function isTelegramUrl(url: string): boolean {
  return TELEGRAM_URL_RE.test(url);
}
