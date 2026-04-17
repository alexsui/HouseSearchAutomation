import { config } from "dotenv";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";

config({ path: ".env.local" });

const candidate = {
  listing_identity: {
    source: "591" as const,
    source_listing_id: `smoke-${Date.now()}`,
    source_url: "https://rent.591.com.tw/home/smoke",
  },
  title: "Smoke Test Listing",
  rent_price: 24000,
  district: "Shilin",
  address_summary: "Shilin District smoke test",
  layout: "2房1廳1衛",
  area_ping: 18,
  floor: "4F/5F",
  score_level: "strong" as const,
  photo_review: "acceptable" as const,
  appliance_review: "complete" as const,
  appliances_seen: ["air_conditioner", "refrigerator", "washing_machine", "water_heater"],
  appliances_missing_or_unknown: [],
  recommendation_reason: "smoke test",
  concerns: [],
  change_type: "new_listing" as const,
  should_notify: true,
};

const up = await handleUpsertListing({
  candidate,
  run_id: `smoke-${Date.now()}`,
  triage_base_url: "https://house-search.vercel.app",
});
console.log("upsert:", up);

if (up.should_notify) {
  const sent = await handleSendLineNotification({
    listing_id: up.listing_id,
    event_type: up.event_type as "new_listing",
    event_hash: up.event_hash!,
    message_body: up.message_body!,
  });
  console.log("send:", sent);
}
