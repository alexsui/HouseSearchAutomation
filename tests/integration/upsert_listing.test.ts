import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
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

describe("handleUpsertListing", () => {
  it("creates listing, review, and change for a new listing and returns should_notify=true", async () => {
    const result = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
    });
    expect(result.should_notify).toBe(true);
    expect(result.event_type).toBe("new_listing");
    expect(result.event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.message_body).toContain("[新物件]");
  });

  it("returns should_notify=false on repeat call with no change", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
    });
    const second = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-2",
    });
    expect(second.should_notify).toBe(false);
  });

  it("returns should_notify=true with event_type=price_drop on rent decrease", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
    });
    const dropped = { ...validCandidate, rent_price: 23000 };
    const second = await handleUpsertListing({
      candidate: dropped,
      run_id: "run-2",
    });
    expect(second.should_notify).toBe(true);
    expect(second.event_type).toBe("price_drop");
    expect(second.message_body).toContain("[降價]");
  });

  it("rejects invalid candidate", async () => {
    const bad = { ...validCandidate, rent_price: 99999 };
    await expect(
      handleUpsertListing({
        candidate: bad as unknown as typeof validCandidate,
        run_id: "run-1",
      }),
    ).rejects.toThrow();
  });
});
