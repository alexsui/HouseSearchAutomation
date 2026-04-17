import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import { handleGetKnownListings } from "@/mcp/handlers/get_known_listings";
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

describe("end-to-end agent flow", () => {
  it("upsert → notify → repeat upsert → no-notify → price drop → notify", async () => {
    mockFetchOk();

    // First run: new listing
    const first = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    expect(first.should_notify).toBe(true);

    const sent = await handleSendLineNotification({
      listing_id: first.listing_id,
      event_type: first.event_type as "new_listing",
      event_hash: first.event_hash!,
      message_body: first.message_body!,
    });
    expect(sent.status).toBe("sent");

    // Second run, identical candidate: no notify
    const second = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r2",
      triage_base_url: "https://app.example.com",
    });
    expect(second.should_notify).toBe(false);

    // Third run, price drop: notify
    const third = await handleUpsertListing({
      candidate: { ...validCandidate, rent_price: 22000 },
      run_id: "r3",
      triage_base_url: "https://app.example.com",
    });
    expect(third.should_notify).toBe(true);
    expect(third.event_type).toBe("price_drop");

    // Known listings reflects latest
    const known = await handleGetKnownListings({ source: "591" });
    expect(known).toHaveLength(1);
    expect(known[0]!.rent_price).toBe(22000);
  });
});
