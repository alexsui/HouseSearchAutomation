import { z } from "zod";
import { REQUIRED_APPLIANCES } from "./types";

const ApplianceEnum = z.enum(REQUIRED_APPLIANCES);

export const ListingIdentitySchema = z.object({
  source: z.literal("591"),
  source_listing_id: z.string().min(1),
  source_url: z.string().url(),
});

export const CandidateSchema = z.object({
  listing_identity: ListingIdentitySchema,
  title: z.string().min(1),
  rent_price: z.number().int().positive().max(30000),
  district: z.string().min(1),
  address_summary: z.string(),
  layout: z.string().min(1),
  area_ping: z.number().positive().nullable(),
  floor: z.string().nullable(),
  score_level: z.enum(["strong", "normal", "loose", "reject"]),
  photo_review: z.enum(["acceptable", "needs_review", "poor"]),
  appliance_review: z.enum(["complete", "partial", "missing"]),
  appliances_seen: z.array(ApplianceEnum),
  appliances_missing_or_unknown: z.array(ApplianceEnum),
  recommendation_reason: z.string(),
  concerns: z.array(z.string()),
  change_type: z.enum([
    "new_listing",
    "price_drop",
    "relisted",
    "became_candidate",
    "material_listing_change",
    "review_change",
    "none",
  ]),
  should_notify: z.boolean(),
  notifier_signature: z.string().optional(),
});

export type CandidateInput = z.input<typeof CandidateSchema>;
