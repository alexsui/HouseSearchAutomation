import { describe, it, expect } from "vitest";
import { renderMessage } from "@/domain/message";
import { validCandidate } from "../fixtures/candidates";

const triageUrl = "https://app.example.com/listings/abc123";

describe("renderMessage", () => {
  it("renders a new_listing message with all required fields", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: validCandidate,
      triage_url: triageUrl,
    });
    expect(msg).toContain("[New Listing]");
    expect(msg).toContain("Shilin");
    expect(msg).toContain("TWD 25,000");
    expect(msg).toContain("Layout: 2房1廳1衛");
    expect(msg).toContain("Budget band: strong");
    expect(msg).toContain(`Title: ${validCandidate.title}`);
    expect(msg).toContain("Seen: air_conditioner, refrigerator");
    expect(msg).toContain("Unknown: washing_machine, water_heater");
    expect(msg).toContain(triageUrl);
    expect(msg).toContain(validCandidate.listing_identity.source_url);
  });

  it("renders a price_drop message with price delta", () => {
    const msg = renderMessage({
      event_type: "price_drop",
      candidate: validCandidate,
      triage_url: triageUrl,
      price_drop: { previous: 28000, current: 25000 },
    });
    expect(msg).toContain("[Price Drop]");
    expect(msg).toContain("28,000");
    expect(msg).toContain("25,000");
  });

  it("marks high concern when photo_review is poor", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: { ...validCandidate, photo_review: "poor" },
      triage_url: triageUrl,
    });
    expect(msg).toContain("HIGH CONCERN");
  });
});
