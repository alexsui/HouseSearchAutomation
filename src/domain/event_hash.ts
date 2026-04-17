import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical";
import type { ChangeType } from "./types";

export type EventType = Exclude<ChangeType, "none">;

export interface EventHashInput {
  event_type: EventType;
  source: "591";
  source_listing_id: string;
  payload: Record<string, unknown>;
}

export function computeEventHash(input: EventHashInput): string {
  const canonical = canonicalJson({
    event_type: input.event_type,
    source: input.source,
    source_listing_id: input.source_listing_id,
    payload: input.payload,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
