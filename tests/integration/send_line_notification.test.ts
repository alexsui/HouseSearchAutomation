import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import { validCandidate } from "../fixtures/candidates";
import { mockFetchOk, mockFetchFail } from "../fixtures/line_mock";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("listings").delete().eq("source", "591");
});

afterEach(() => vi.unstubAllGlobals());

describe("handleSendLineNotification", () => {
  it("sends LINE push and records sent notification", async () => {
    const fetchMock = mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    expect(up.should_notify).toBe(true);

    const out = await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    expect(out.status).toBe("sent");
    const lineCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "https://api.line.me/v2/bot/message/broadcast",
    );
    expect(lineCalls).toHaveLength(1);
  });

  it("rejects when (listing_id, event_type, event_hash) already sent", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    await expect(
      handleSendLineNotification({
        listing_id: up.listing_id,
        event_type: up.event_type as "new_listing",
        event_hash: up.event_hash!,
        message_body: up.message_body!,
      }),
    ).rejects.toThrow(/already sent/);
  });

  it("structured notify renders + dedupes by (source, source_listing_id, event_type, event_hash)", async () => {
    const fetchMock = mockFetchOk();
    const supabase = getServerClient();
    await supabase.from("notifications").delete().eq("source", "591");

    const first = await handleSendLineNotification({
      candidate: validCandidate,
      event_type: "new_listing",
      triage_base_url: "https://app.example.com",
    });
    expect(first.status).toBe("sent");
    expect(first.notification_id).not.toBeNull();

    const second = await handleSendLineNotification({
      candidate: validCandidate,
      event_type: "new_listing",
      triage_base_url: "https://app.example.com",
    });
    expect(second.status).toBe("already_sent");
    expect(second.notification_id).toBeNull();

    const lineCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "https://api.line.me/v2/bot/message/broadcast",
    );
    expect(lineCalls).toHaveLength(1);

    const body = JSON.parse((lineCalls[0]![1] as RequestInit).body as string);
    const text = body.messages[0].text as string;
    expect(text).toContain(`Title: ${validCandidate.title}`);
    expect(text).toContain("Budget band: strong");
    expect(text).toContain(
      `591: ${validCandidate.listing_identity.source_url}`,
    );
  });

  it("structured notify skips LINE and DB for score_level=reject", async () => {
    const fetchMock = mockFetchOk();
    const out = await handleSendLineNotification({
      candidate: { ...validCandidate, score_level: "reject" },
      event_type: "new_listing",
      triage_base_url: "https://app.example.com",
    });
    expect(out.status).toBe("already_sent");
    expect(out.notification_id).toBeNull();
    const lineCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "https://api.line.me/v2/bot/message/broadcast",
    );
    expect(lineCalls).toHaveLength(0);
  });

  it("standalone push (message_body only) skips DB and returns null id", async () => {
    const fetchMock = mockFetchOk();
    const out = await handleSendLineNotification({
      message_body: "standalone test",
    });
    expect(out.status).toBe("sent");
    expect(out.notification_id).toBeNull();
    const lineCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "https://api.line.me/v2/bot/message/broadcast",
    );
    expect(lineCalls).toHaveLength(1);
  });

  it("records failed notification on LINE API error", async () => {
    mockFetchFail(500, { message: "boom" });
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    const out = await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    expect(out.status).toBe("failed");
    const supabase = getServerClient();
    const { data } = await supabase
      .from("notifications")
      .select("status")
      .eq("listing_id", up.listing_id);
    expect(data?.map((d) => d.status)).toContain("failed");
  });
});
