export type ScoreLevel = "strong" | "normal" | "loose" | "reject";
export type PhotoReview = "acceptable" | "needs_review" | "poor";
export type ApplianceReview = "complete" | "partial" | "missing";
export type ChangeType =
  | "new_listing"
  | "price_drop"
  | "relisted"
  | "became_candidate"
  | "material_listing_change"
  | "review_change"
  | "none";

export const REQUIRED_APPLIANCES = [
  "air_conditioner",
  "refrigerator",
  "washing_machine",
  "water_heater",
] as const;
export type Appliance = (typeof REQUIRED_APPLIANCES)[number];

export interface ListingIdentity {
  source: "591";
  source_listing_id: string;
  source_url: string;
}

export interface Candidate {
  listing_identity: ListingIdentity;
  title: string;
  rent_price: number;
  district: string;
  address_summary: string;
  layout: string;
  area_ping: number | null;
  floor: string | null;
  score_level: ScoreLevel;
  photo_review: PhotoReview;
  appliance_review: ApplianceReview;
  appliances_seen: Appliance[];
  appliances_missing_or_unknown: Appliance[];
  recommendation_reason: string;
  concerns: string[];
  change_type: ChangeType;
  should_notify: boolean;
  notifier_signature?: string;
}
