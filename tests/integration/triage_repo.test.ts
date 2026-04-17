import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import {
  upsertTriageStatus,
  upsertTriageNote,
  fetchTriage,
} from "@/services/repositories/triage";
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

describe("triage repo", () => {
  it("creates then updates status for a listing", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await upsertTriageStatus(up.listing_id, "Interested");
    let t = await fetchTriage(up.listing_id);
    expect(t?.status).toBe("Interested");
    await upsertTriageStatus(up.listing_id, "Viewing");
    t = await fetchTriage(up.listing_id);
    expect(t?.status).toBe("Viewing");
  });

  it("rejects invalid status", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await expect(upsertTriageStatus(up.listing_id, "bogus")).rejects.toThrow();
  });

  it("updates note independently of status", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await upsertTriageNote(up.listing_id, "landlord emailed 2026-04-17");
    const t = await fetchTriage(up.listing_id);
    expect(t?.note).toBe("landlord emailed 2026-04-17");
    expect(t?.status).toBe("New");
  });
});
