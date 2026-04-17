import type { Candidate, ChangeType, ScoreLevel } from "./types";

export interface PriorSnapshot {
  rent_price: number;
  district: string;
  address_summary: string;
  layout: string;
  area_ping: number | null;
  floor: string | null;
  score_level: ScoreLevel;
  photo_review: string;
  appliance_review: string;
  appliances_seen: string[];
  appliances_missing_or_unknown: string[];
}

export interface DetectedChange {
  change_type: Exclude<ChangeType, "none">;
  payload: Record<string, unknown>;
  summary: string;
}

export function detectChanges(input: {
  prior: PriorSnapshot | null;
  priorReview: PriorSnapshot | null;
  candidate: Candidate;
}): DetectedChange[] {
  const { prior, priorReview, candidate } = input;

  if (!prior) {
    return [
      {
        change_type: "new_listing",
        payload: {
          source_listing_id: candidate.listing_identity.source_listing_id,
          source_url: candidate.listing_identity.source_url,
          rent_price: candidate.rent_price,
          district: candidate.district,
          layout: candidate.layout,
          area_ping: candidate.area_ping,
          floor: candidate.floor,
          score_level: candidate.score_level,
          photo_review: candidate.photo_review,
          appliance_review: candidate.appliance_review,
        },
        summary: `new listing at TWD ${candidate.rent_price}`,
      },
    ];
  }

  const out: DetectedChange[] = [];

  if (candidate.rent_price < prior.rent_price) {
    out.push({
      change_type: "price_drop",
      payload: {
        source_listing_id: candidate.listing_identity.source_listing_id,
        previous_rent_price: prior.rent_price,
        current_rent_price: candidate.rent_price,
      },
      summary: `rent dropped from ${prior.rent_price} to ${candidate.rent_price}`,
    });
  }

  if (
    priorReview &&
    priorReview.score_level === "reject" &&
    candidate.score_level !== "reject"
  ) {
    out.push({
      change_type: "became_candidate",
      payload: {
        previous_score_level: priorReview.score_level,
        current_score_level: candidate.score_level,
        photo_review: candidate.photo_review,
        appliance_review: candidate.appliance_review,
      },
      summary: `promoted from reject to ${candidate.score_level}`,
    });
  }

  const materialChanged: Record<string, unknown> = {};
  if (candidate.rent_price !== prior.rent_price) materialChanged.rent_price = candidate.rent_price;
  if (candidate.district !== prior.district) materialChanged.district = candidate.district;
  if (candidate.address_summary !== prior.address_summary)
    materialChanged.address_summary = candidate.address_summary;
  if (candidate.layout !== prior.layout) materialChanged.layout = candidate.layout;
  if (candidate.area_ping !== prior.area_ping) materialChanged.area_ping = candidate.area_ping;
  if (candidate.floor !== prior.floor) materialChanged.floor = candidate.floor;
  if (Object.keys(materialChanged).length > 0 && !materialChanged.rent_price) {
    out.push({
      change_type: "material_listing_change",
      payload: materialChanged,
      summary: `material fields changed: ${Object.keys(materialChanged).join(", ")}`,
    });
  } else if (Object.keys(materialChanged).length > 1) {
    out.push({
      change_type: "material_listing_change",
      payload: materialChanged,
      summary: `material fields changed: ${Object.keys(materialChanged).join(", ")}`,
    });
  }

  if (priorReview) {
    if (
      priorReview.photo_review !== candidate.photo_review ||
      priorReview.appliance_review !== candidate.appliance_review ||
      !arraysEqual(priorReview.appliances_seen, candidate.appliances_seen) ||
      !arraysEqual(
        priorReview.appliances_missing_or_unknown,
        candidate.appliances_missing_or_unknown,
      )
    ) {
      out.push({
        change_type: "review_change",
        payload: {
          previous_photo_review: priorReview.photo_review,
          current_photo_review: candidate.photo_review,
          previous_appliance_review: priorReview.appliance_review,
          current_appliance_review: candidate.appliance_review,
          previous_appliances_seen: priorReview.appliances_seen,
          current_appliances_seen: candidate.appliances_seen,
          previous_appliances_missing_or_unknown: priorReview.appliances_missing_or_unknown,
          current_appliances_missing_or_unknown: candidate.appliances_missing_or_unknown,
        },
        summary: `review signals changed`,
      });
    }
  }

  return out;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
