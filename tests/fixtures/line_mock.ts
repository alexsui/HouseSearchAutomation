import { vi } from "vitest";

const LINE_URL = "https://api.line.me/v2/bot/message/broadcast";

function wrap(
  handler: (url: string, init?: RequestInit) => Response,
): ReturnType<typeof vi.fn> {
  const realFetch = globalThis.fetch;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === LINE_URL) return handler(url, init);
    return realFetch(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function mockFetchOk(): ReturnType<typeof vi.fn> {
  return wrap(
    () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

export function mockFetchFail(
  status = 500,
  body: Record<string, unknown> = { message: "err" },
): ReturnType<typeof vi.fn> {
  return wrap(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}
