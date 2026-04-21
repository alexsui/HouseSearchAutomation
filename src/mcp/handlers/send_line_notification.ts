import { pushTelegramMessage } from "@/services/telegram";
import {
  hasPriorSourceNotification,
  insertNotification,
} from "@/services/repositories/notifications";
import { CandidateSchema } from "@/domain/schema";
import type { Candidate, ChangeType } from "@/domain/types";
import { renderMessage } from "@/domain/message";
import { computeEventHash, type EventType } from "@/domain/event_hash";

// Single supported shape: structured candidate notify.
// { candidate, event_type }
// Server renders the message, computes event_hash, dedupes by
// (source, source_listing_id) URL-only, and broadcasts.

export interface SendLineNotificationInput {
  candidate: Candidate;
  event_type: string;
}

export interface SendLineNotificationResult {
  status: "sent" | "failed" | "already_sent";
  notification_id: string | null;
}

export async function handleSendLineNotification(
  input: SendLineNotificationInput,
): Promise<SendLineNotificationResult> {
  if (!input.candidate || !input.event_type) {
    throw new Error("send_line_notification requires {candidate, event_type}");
  }

  const candidate = CandidateSchema.parse(input.candidate) as Candidate;
  const event_type = input.event_type as EventType;

  if (candidate.score_level === "reject") {
    return { status: "already_sent", notification_id: null };
  }

  // Dedup key stays STABLE across re-evaluations of the same listing:
  // only identity + rent_price. score_level / photo_review / appliance_review
  // are subjective agent judgments and will drift between runs, which would
  // defeat the dedup (same listing fires twice because the hash differs).
  // Only actual rent changes should produce a new event_hash → new notify.
  const event_hash = computeEventHash({
    event_type,
    source: candidate.listing_identity.source,
    source_listing_id: candidate.listing_identity.source_listing_id,
    payload: {
      rent_price: candidate.rent_price,
    },
  });

  const already = await hasPriorSourceNotification(
    candidate.listing_identity.source,
    candidate.listing_identity.source_listing_id,
  );
  if (already) {
    return { status: "already_sent", notification_id: null };
  }

  const message_body = renderMessage({ event_type, candidate });

  const pushResult = await pushTelegramMessage(message_body);
  const row = await insertNotification({
    source: candidate.listing_identity.source,
    source_listing_id: candidate.listing_identity.source_listing_id,
    event_type,
    event_hash,
    message_body,
    status: pushResult.status,
    provider_response: pushResult.response,
  });
  return { status: pushResult.status, notification_id: row.id };
}

export type { ChangeType };
