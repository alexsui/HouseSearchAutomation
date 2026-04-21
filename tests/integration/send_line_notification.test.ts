import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import { validCandidate } from "../fixtures/candidates";
import { mockFetchOk, mockFetchFail, isTelegramUrl } from "../fixtures/telegram_mock";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("notifications").delete().eq("source", "591");
  await supabase.from("notifications").delete().eq("source", "nearyou");
});

afterEach(() => vi.unstubAllGlobals());

describe("handleSendLineNotification", () => {
  it("structured notify renders + dedupes by (source, source_listing_id)", async () => {
    const fetchMock = mockFetchOk();

    const first = await handleSendLineNotification({
      candidate: validCandidate,
      event_type: "new_listing",
    });
    expect(first.status).toBe("sent");
    expect(first.notification_id).not.toBeNull();

    const second = await handleSendLineNotification({
      candidate: validCandidate,
      event_type: "new_listing",
    });
    expect(second.status).toBe("already_sent");
    expect(second.notification_id).toBeNull();

    const tgCalls = fetchMock.mock.calls.filter(([url]) =>
      isTelegramUrl(String(url)),
    );
    expect(tgCalls).toHaveLength(1);

    const body = JSON.parse((tgCalls[0]![1] as RequestInit).body as string);
    const text = body.text as string;
    expect(text).toContain(`標題：${validCandidate.title}`);
    expect(text).toContain("預算分級：強力推薦");
    expect(text).toContain(
      `591：${validCandidate.listing_identity.source_url}`,
    );
  });

  it("structured notify accepts nearyou source and renders NearYou label", async () => {
    const fetchMock = mockFetchOk();
    const nearyouCandidate = {
      ...validCandidate,
      listing_identity: {
        source: "nearyou" as const,
        source_listing_id: "69dbb451fe8930b7d7d651d8",
        source_url:
          "https://nearyou.com.tw/property-detail/69dbb451fe8930b7d7d651d8",
      },
    };

    const out = await handleSendLineNotification({
      candidate: nearyouCandidate,
      event_type: "new_listing",
    });
    expect(out.status).toBe("sent");
    expect(out.notification_id).not.toBeNull();

    const tgCalls = fetchMock.mock.calls.filter(([url]) =>
      isTelegramUrl(String(url)),
    );
    const body = JSON.parse((tgCalls[0]![1] as RequestInit).body as string);
    const text = body.text as string;
    expect(text).toContain(`NearYou：${nearyouCandidate.listing_identity.source_url}`);
  });

  it("structured notify skips LINE and DB for score_level=reject", async () => {
    const fetchMock = mockFetchOk();
    const out = await handleSendLineNotification({
      candidate: { ...validCandidate, score_level: "reject" },
      event_type: "new_listing",
    });
    expect(out.status).toBe("already_sent");
    expect(out.notification_id).toBeNull();
    const tgCalls = fetchMock.mock.calls.filter(([url]) =>
      isTelegramUrl(String(url)),
    );
    expect(tgCalls).toHaveLength(0);
  });

  it("records failed notification on LINE API error", async () => {
    mockFetchFail(500, { message: "boom" });
    const out = await handleSendLineNotification({
      candidate: validCandidate,
      event_type: "new_listing",
    });
    expect(out.status).toBe("failed");
    const supabase = getServerClient();
    const { data } = await supabase
      .from("notifications")
      .select("status")
      .eq("source", "591")
      .eq("source_listing_id", validCandidate.listing_identity.source_listing_id);
    expect(data?.map((d) => d.status)).toContain("failed");
  });

  it("rejects invalid input", async () => {
    await expect(handleSendLineNotification({} as never)).rejects.toThrow(
      /requires \{candidate/,
    );
  });
});
