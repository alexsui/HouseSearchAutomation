import { describe, it, expect } from "vitest";
import { computeEventHash } from "@/domain/event_hash";

describe("computeEventHash", () => {
  it("produces a 64-char hex sha256", () => {
    const hash = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "abc",
      payload: { rent_price: 25000 },
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across runs", () => {
    const input = {
      event_type: "price_drop" as const,
      source: "591" as const,
      source_listing_id: "xyz",
      payload: { previous_rent_price: 28000, current_rent_price: 25000 },
    };
    expect(computeEventHash(input)).toBe(computeEventHash(input));
  });

  it("is stable under equivalent payloads", () => {
    const a = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { b: 1, a: 2, n: null },
    });
    const b = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { a: 2, b: 1 },
    });
    expect(a).toBe(b);
  });

  it("changes when payload changes", () => {
    const a = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { rent_price: 25000 },
    });
    const b = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { rent_price: 24000 },
    });
    expect(a).not.toBe(b);
  });
});
