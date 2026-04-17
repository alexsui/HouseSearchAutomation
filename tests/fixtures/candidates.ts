import type { Candidate } from "@/domain/types";

export const validCandidate: Candidate = {
  listing_identity: {
    source: "591",
    source_listing_id: "abc123",
    source_url: "https://rent.591.com.tw/home/abc123",
  },
  title: "Shilin 2BR Near MRT",
  rent_price: 25000,
  district: "Shilin",
  address_summary: "Shilin District, Near Zhishan MRT",
  layout: "2房1廳1衛",
  area_ping: 18,
  floor: "4F/5F",
  score_level: "strong",
  photo_review: "acceptable",
  appliance_review: "partial",
  appliances_seen: ["air_conditioner", "refrigerator"],
  appliances_missing_or_unknown: ["washing_machine", "water_heater"],
  recommendation_reason: "price in range, clean photos",
  concerns: ["bathroom photos dark"],
  change_type: "new_listing",
  should_notify: true,
};
