import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleGetKnownListings } from "@/mcp/handlers/get_known_listings";
import { validCandidate } from "../fixtures/candidates";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("listings").delete().eq("source", "591");
});

describe("handleGetKnownListings", () => {
  it("returns an empty list when no listings", async () => {
    const out = await handleGetKnownListings({ source: "591" });
    expect(out).toEqual([]);
  });

  it("returns recent listings with review signals", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
    });
    const out = await handleGetKnownListings({ source: "591" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source_listing_id: "abc123",
      rent_price: 25000,
      score_level: "strong",
    });
  });

  it("respects the since filter", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    const out = await handleGetKnownListings({ source: "591", since: future });
    expect(out).toEqual([]);
  });
});
