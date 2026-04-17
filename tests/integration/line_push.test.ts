import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pushLineMessage } from "@/services/line";
import { mockFetchOk, mockFetchFail } from "../fixtures/line_mock";

beforeEach(() => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
  process.env.LINE_USER_ID = "U-test";
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.AUTOMATION_SECRET = "01234567890123456789";
  process.env.TRIAGE_PASSWORD = "hunter2-long";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.SESSION_SIGNING_SECRET = "a".repeat(32);
});

afterEach(() => vi.unstubAllGlobals());

describe("pushLineMessage", () => {
  it("POSTs to LINE with bearer token and JSON body", async () => {
    const fetchMock = mockFetchOk();
    const result = await pushLineMessage("hello");
    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("U-test");
    expect(body.messages[0]).toEqual({ type: "text", text: "hello" });
  });

  it("returns failed status on non-2xx response", async () => {
    mockFetchFail(500, { message: "boom" });
    const result = await pushLineMessage("hello");
    expect(result.status).toBe("failed");
    expect(result.response).toMatchObject({ status: 500 });
  });
});
