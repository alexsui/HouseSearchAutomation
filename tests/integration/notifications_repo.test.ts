import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { upsertListing } from "@/services/repositories/listings";
import { insertChange } from "@/services/repositories/changes";
import {
  hasPriorSentNotification,
  insertNotification,
} from "@/services/repositories/notifications";
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

describe("changes repo", () => {
  it("inserts a change row", async () => {
    const listing = await upsertListing(validCandidate);
    const change = await insertChange({
      listing_id: listing.id,
      run_id: "run-1",
      change_type: "new_listing",
      before_snapshot: null,
      after_snapshot: { rent_price: 25000 },
      change_summary: "first observation",
    });
    expect(change.change_type).toBe("new_listing");
  });
});

describe("notifications repo", () => {
  it("returns false when no prior sent notification", async () => {
    const listing = await upsertListing(validCandidate);
    const has = await hasPriorSentNotification(listing.id, "new_listing", "hash-a");
    expect(has).toBe(false);
  });

  it("returns true after a sent notification is recorded", async () => {
    const listing = await upsertListing(validCandidate);
    await insertNotification({
      listing_id: listing.id,
      event_type: "new_listing",
      event_hash: "hash-b",
      message_body: "test",
      status: "sent",
      provider_response: { ok: true },
    });
    const has = await hasPriorSentNotification(listing.id, "new_listing", "hash-b");
    expect(has).toBe(true);
  });

  it("does not count failed notifications as duplicates", async () => {
    const listing = await upsertListing(validCandidate);
    await insertNotification({
      listing_id: listing.id,
      event_type: "new_listing",
      event_hash: "hash-c",
      message_body: "test",
      status: "failed",
      provider_response: { error: "network" },
    });
    const has = await hasPriorSentNotification(listing.id, "new_listing", "hash-c");
    expect(has).toBe(false);
  });
});
