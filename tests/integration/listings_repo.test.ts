import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { upsertListing, findListingByIdentity } from "@/services/repositories/listings";
import { insertReview } from "@/services/repositories/reviews";
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

describe("listings repo", () => {
  it("upserts a new listing and returns the row", async () => {
    const row = await upsertListing(validCandidate);
    expect(row.source_listing_id).toBe("abc123");
    expect(row.rent_price).toBe(25000);
    expect(row.first_seen_at).toBeDefined();
  });

  it("updates existing listing on repeat upsert and keeps first_seen_at", async () => {
    const first = await upsertListing(validCandidate);
    const second = await upsertListing({ ...validCandidate, rent_price: 24000 });
    expect(second.id).toBe(first.id);
    expect(second.rent_price).toBe(24000);
    expect(second.first_seen_at).toBe(first.first_seen_at);
  });

  it("finds a listing by identity", async () => {
    await upsertListing(validCandidate);
    const row = await findListingByIdentity("591", "abc123");
    expect(row?.source_listing_id).toBe("abc123");
  });
});

describe("reviews repo", () => {
  it("inserts a review for an existing listing", async () => {
    const listing = await upsertListing(validCandidate);
    const review = await insertReview({
      listing_id: listing.id,
      run_id: "run-1",
      candidate: validCandidate,
    });
    expect(review.score_level).toBe("strong");
    expect(review.appliances_seen).toEqual(["air_conditioner", "refrigerator"]);
  });
});
