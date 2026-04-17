import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import {
  fetchCandidateList,
  fetchCandidateDetail,
} from "@/services/repositories/views";
import { validCandidate } from "../fixtures/candidates";
import { mockFetchOk } from "../fixtures/line_mock";

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

describe("triage views", () => {
  it("list excludes listings that were never notified", async () => {
    await handleUpsertListing({
      candidate: { ...validCandidate, score_level: "reject" },
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    const list = await fetchCandidateList({});
    expect(list).toEqual([]);
  });

  it("list includes listings with at least one notification", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    const list = await fetchCandidateList({});
    expect(list).toHaveLength(1);
    expect(list[0]!.source_listing_id).toBe("abc123");
  });

  it("list filters by score_level", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    expect(await fetchCandidateList({ scoreLevel: "strong" })).toHaveLength(1);
    expect(await fetchCandidateList({ scoreLevel: "loose" })).toHaveLength(0);
  });

  it("detail returns listing + reviews + notifications + changes", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    const detail = await fetchCandidateDetail(up.listing_id);
    expect(detail?.listing.source_listing_id).toBe("abc123");
    expect(detail?.reviews.length).toBeGreaterThan(0);
    expect(detail?.notifications.length).toBe(1);
    expect(detail?.changes.length).toBeGreaterThan(0);
  });
});
