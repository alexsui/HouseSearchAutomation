import type { Candidate, ChangeType } from "./types";

const HEADER: Record<Exclude<ChangeType, "none">, string> = {
  new_listing: "New Listing",
  price_drop: "Price Drop",
  relisted: "Relisted",
  became_candidate: "Now a Candidate",
  material_listing_change: "Listing Updated",
  review_change: "Review Updated",
};

export interface RenderInput {
  event_type: Exclude<ChangeType, "none">;
  candidate: Candidate;
  triage_url: string;
  price_drop?: { previous: number; current: number };
}

export function renderMessage(input: RenderInput): string {
  const { event_type, candidate, triage_url, price_drop } = input;
  const c = candidate;
  const header = `[${HEADER[event_type]}] ${c.district} ${c.layout.split("房")[0]}BR TWD ${fmt(c.rent_price)}`;

  const lines: string[] = [header, "", `Title: ${c.title}`];

  if (event_type === "price_drop" && price_drop) {
    lines.push(`Rent: TWD ${fmt(price_drop.current)}/month (was TWD ${fmt(price_drop.previous)})`);
  } else {
    lines.push(`Rent: TWD ${fmt(c.rent_price)}/month`);
  }

  lines.push(
    `District: ${c.district}`,
    `Layout: ${c.layout}`,
    `Area: ${c.area_ping ?? "?"} ping`,
    `Floor: ${c.floor ?? "?"}`,
    `Budget band: ${c.score_level}`,
    `Photo review: ${c.photo_review}`,
    `Appliance review: ${c.appliance_review}`,
  );

  if (c.appliances_seen.length > 0) lines.push(`Seen: ${c.appliances_seen.join(", ")}`);
  if (c.appliances_missing_or_unknown.length > 0)
    lines.push(`Unknown: ${c.appliances_missing_or_unknown.join(", ")}`);

  if (c.recommendation_reason) lines.push(`Why it is worth checking: ${c.recommendation_reason}`);
  if (c.concerns.length > 0) lines.push(`Concerns: ${c.concerns.join("; ")}`);

  if (c.photo_review === "poor") lines.push("⚠ HIGH CONCERN: photos look poor; confirm manually");

  lines.push(`591: ${c.listing_identity.source_url}`, `Triage: ${triage_url}`);
  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
