import { describe, it, expect } from "vitest";
import { CandidateSchema } from "@/domain/schema";
import { validCandidate } from "../fixtures/candidates";

describe("CandidateSchema", () => {
  it("accepts a valid candidate", () => {
    expect(() => CandidateSchema.parse(validCandidate)).not.toThrow();
  });

  it("rejects missing source_listing_id", () => {
    const bad = {
      ...validCandidate,
      listing_identity: { ...validCandidate.listing_identity, source_listing_id: "" },
    };
    expect(() => CandidateSchema.parse(bad)).toThrow();
  });

  it("rejects out-of-range score_level", () => {
    const bad = { ...validCandidate, score_level: "maybe" };
    expect(() => CandidateSchema.parse(bad)).toThrow();
  });

  it("rejects rent_price over 30000", () => {
    const bad = { ...validCandidate, rent_price: 31000 };
    expect(() => CandidateSchema.parse(bad)).toThrow();
  });

  it("allows area_ping and floor to be null", () => {
    const ok = { ...validCandidate, area_ping: null, floor: null };
    expect(() => CandidateSchema.parse(ok)).not.toThrow();
  });
});
