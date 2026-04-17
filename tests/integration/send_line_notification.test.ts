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
      ([url]) => String(url) === "https://api.line.me/v2/bot/message/push",
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
