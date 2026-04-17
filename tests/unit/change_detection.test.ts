import { describe, it, expect } from "vitest";
import { detectChanges } from "@/domain/change_detection";
import { validCandidate } from "../fixtures/candidates";
import type { Candidate } from "@/domain/types";

const prior = {
  rent_price: 28000,
  district: validCandidate.district,
  address_summary: validCandidate.address_summary,
  layout: validCandidate.layout,
  area_ping: validCandidate.area_ping,
  floor: validCandidate.floor,
  score_level: "normal" as const,
  photo_review: validCandidate.photo_review,
  appliance_review: validCandidate.appliance_review,
  appliances_seen: validCandidate.appliances_seen,
  appliances_missing_or_unknown: validCandidate.appliances_missing_or_unknown,
};

describe("detectChanges", () => {
  it("returns new_listing when no prior listing exists", () => {
    const out = detectChanges({ prior: null, priorReview: null, candidate: validCandidate });
    expect(out.map((c) => c.change_type)).toContain("new_listing");
  });

  it("returns price_drop when rent decreases", () => {
    const candidate = { ...validCandidate, rent_price: 24000 };
    const out = detectChanges({
      prior: { ...prior, rent_price: 28000 },
      priorReview: prior,
      candidate,
    });
    const kinds = out.map((c) => c.change_type);
    expect(kinds).toContain("price_drop");
  });

  it("returns became_candidate when prior was reject and current is not", () => {
    const candidate: Candidate = { ...validCandidate, score_level: "strong" };
    const out = detectChanges({
      prior,
      priorReview: { ...prior, score_level: "reject" },
      candidate,
    });
    expect(out.map((c) => c.change_type)).toContain("became_candidate");
  });

  it("returns material_listing_change on layout change", () => {
    const candidate = { ...validCandidate, layout: "3房2廳2衛" };
    const out = detectChanges({ prior, priorReview: prior, candidate });
    expect(out.map((c) => c.change_type)).toContain("material_listing_change");
  });

  it("returns review_change when photo_review changes", () => {
    const candidate = { ...validCandidate, photo_review: "poor" as const };
    const out = detectChanges({ prior, priorReview: prior, candidate });
    expect(out.map((c) => c.change_type)).toContain("review_change");
  });

  it("returns empty array on no meaningful change", () => {
    const out = detectChanges({
      prior: { ...prior, rent_price: validCandidate.rent_price },
      priorReview: {
        ...prior,
        rent_price: validCandidate.rent_price,
        score_level: validCandidate.score_level,
      },
      candidate: validCandidate,
    });
    expect(out).toEqual([]);
  });
});
