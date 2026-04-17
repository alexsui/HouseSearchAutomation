import { describe, it, expect } from "vitest";
import { renderMessage } from "@/domain/message";
import { validCandidate } from "../fixtures/candidates";

const triageUrl = "https://app.example.com/listings/abc123";

describe("renderMessage", () => {
  it("renders a new_listing message with all required fields in Traditional Chinese", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: validCandidate,
      triage_url: triageUrl,
    });
    expect(msg).toContain("[新物件]");
    expect(msg).toContain("Shilin");
    expect(msg).toContain("NT$25,000");
    expect(msg).toContain("格局：2房1廳1衛");
    expect(msg).toContain("預算分級：強力推薦");
    expect(msg).toContain(`標題：${validCandidate.title}`);
    expect(msg).toContain("已見：冷氣、冰箱");
    expect(msg).toContain("未確認：洗衣機、熱水器");
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
    expect(msg).toContain("[降價]");
    expect(msg).toContain("28,000");
    expect(msg).toContain("25,000");
  });

  it("appends notifier_signature as the final line when set", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: { ...validCandidate, notifier_signature: "由 Claude 自動檢查並通知" },
      triage_url: triageUrl,
    });
    const lines = msg.split("\n");
    expect(lines[lines.length - 1]).toBe("— 由 Claude 自動檢查並通知");
  });

  it("omits the signature footer when notifier_signature is absent", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: validCandidate,
      triage_url: triageUrl,
    });
    expect(msg).not.toContain("— ");
    expect(msg.endsWith(triageUrl)).toBe(true);
  });

  it("marks high concern when photo_review is poor", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: { ...validCandidate, photo_review: "poor" },
      triage_url: triageUrl,
    });
    expect(msg).toContain("⚠ 高度警示");
  });
});
