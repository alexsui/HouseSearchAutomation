import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pushTelegramMessage } from "@/services/telegram";
import { mockFetchOk, mockFetchFail } from "../fixtures/telegram_mock";

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "123456789";
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.AUTOMATION_SECRET = "01234567890123456789";
});

afterEach(() => vi.unstubAllGlobals());

describe("pushTelegramMessage", () => {
  it("POSTs to Telegram sendMessage with chat_id and text", async () => {
    const fetchMock = mockFetchOk();
    const result = await pushTelegramMessage("hello");
    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.telegram.org/bottest-token/sendMessage",
    );
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      chat_id: "123456789",
      text: "hello",
      disable_web_page_preview: true,
    });
  });

  it("returns failed status on non-2xx response", async () => {
    mockFetchFail(500, { ok: false, description: "boom" });
    const result = await pushTelegramMessage("hello");
    expect(result.status).toBe("failed");
    expect(result.response).toMatchObject({ status: 500 });
  });
});
