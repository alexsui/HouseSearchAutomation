import { CandidateSchema } from "@/domain/schema";
import type { Candidate, ChangeType } from "@/domain/types";
import { detectChanges, type PriorSnapshot } from "@/domain/change_detection";
import { computeEventHash, type EventType } from "@/domain/event_hash";
import { renderMessage } from "@/domain/message";
import {
  findListingByIdentity,
  upsertListing,
  type ListingRow,
} from "@/services/repositories/listings";
import { fetchLatestReview, insertReview } from "@/services/repositories/reviews";
import { insertChange } from "@/services/repositories/changes";
import { hasPriorSentNotification } from "@/services/repositories/notifications";

export interface UpsertListingInput {
  candidate: Candidate;
  run_id: string;
  triage_base_url: string;
}

export interface UpsertListingResult {
  should_notify: boolean;
  event_type: ChangeType;
  event_hash: string | null;
  message_body: string | null;
  listing_id: string;
}

const PRIORITY: EventType[] = [
  "price_drop",
  "became_candidate",
  "new_listing",
  "review_change",
  "material_listing_change",
  "relisted",
];

export async function handleUpsertListing(
  input: UpsertListingInput,
): Promise<UpsertListingResult> {
  const candidate = CandidateSchema.parse(input.candidate) as Candidate;

  const prior = await findListingByIdentity(
    candidate.listing_identity.source,
    candidate.listing_identity.source_listing_id,
  );
  const priorReview = prior ? await fetchLatestReview(prior.id) : null;

  const priorSnapshot: PriorSnapshot | null = prior
    ? {
        rent_price: prior.rent_price,
        district: prior.district,
        address_summary: prior.address_summary,
        layout: prior.layout,
        area_ping: prior.area_ping,
        floor: prior.floor,
        score_level: (priorReview?.score_level as PriorSnapshot["score_level"]) ?? "normal",
        photo_review: priorReview?.photo_review ?? "",
        appliance_review: priorReview?.appliance_review ?? "",
        appliances_seen: priorReview?.appliances_seen ?? [],
        appliances_missing_or_unknown: priorReview?.appliances_missing_or_unknown ?? [],
      }
    : null;

  const priorReviewSnapshot: PriorSnapshot | null = priorReview
    ? {
        rent_price: prior!.rent_price,
        district: prior!.district,
        address_summary: prior!.address_summary,
        layout: prior!.layout,
        area_ping: prior!.area_ping,
        floor: prior!.floor,
        score_level: priorReview.score_level as PriorSnapshot["score_level"],
        photo_review: priorReview.photo_review,
        appliance_review: priorReview.appliance_review,
        appliances_seen: priorReview.appliances_seen,
        appliances_missing_or_unknown: priorReview.appliances_missing_or_unknown,
      }
    : null;

  const listing: ListingRow = await upsertListing(candidate);
  await insertReview({ listing_id: listing.id, run_id: input.run_id, candidate });

  const detected = detectChanges({
    prior: priorSnapshot,
    priorReview: priorReviewSnapshot,
    candidate,
  });

  for (const change of detected) {
    await insertChange({
      listing_id: listing.id,
      run_id: input.run_id,
      change_type: change.change_type,
      before_snapshot: priorSnapshot as Record<string, unknown> | null,
      after_snapshot: { candidate },
      change_summary: change.summary,
    });
  }

  if (detected.length === 0 || candidate.score_level === "reject") {
    return {
      should_notify: false,
      event_type: "none",
      event_hash: null,
      message_body: null,
      listing_id: listing.id,
    };
  }

  const chosen = pickPriority(detected);
  const event_hash = computeEventHash({
    event_type: chosen.change_type,
    source: "591",
    source_listing_id: candidate.listing_identity.source_listing_id,
    payload: chosen.payload,
  });

  const already = await hasPriorSentNotification(listing.id, chosen.change_type, event_hash);
  if (already) {
    return {
      should_notify: false,
      event_type: chosen.change_type,
      event_hash,
      message_body: null,
      listing_id: listing.id,
    };
  }

  const triage_url = `${input.triage_base_url.replace(/\/$/, "")}/listings/${listing.id}`;
  const message_body = renderMessage({
    event_type: chosen.change_type,
    candidate,
    triage_url,
    price_drop:
      chosen.change_type === "price_drop"
        ? {
            previous: chosen.payload.previous_rent_price as number,
            current: chosen.payload.current_rent_price as number,
          }
        : undefined,
  });

  return {
    should_notify: true,
    event_type: chosen.change_type,
    event_hash,
    message_body,
    listing_id: listing.id,
  };
}

function pickPriority(changes: ReturnType<typeof detectChanges>) {
  for (const kind of PRIORITY) {
    const hit = changes.find((c) => c.change_type === kind);
    if (hit) return hit;
  }
  return changes[0]!;
}
