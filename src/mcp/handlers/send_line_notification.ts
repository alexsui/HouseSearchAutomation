import { pushLineMessage } from "@/services/line";
import {
  hasPriorSentNotification,
  hasPriorSourceNotification,
  insertNotification,
} from "@/services/repositories/notifications";
import { CandidateSchema } from "@/domain/schema";
import type { Candidate, ChangeType } from "@/domain/types";
import { renderMessage } from "@/domain/message";
import { computeEventHash, type EventType } from "@/domain/event_hash";

// Three invocation shapes, matched in this order:
//
// 1. Structured notify (preferred for the cron agent):
//    { candidate, event_type, triage_base_url }
//    Server renders the message via renderMessage(), computes event_hash,
//    dedupes by (source, source_listing_id, event_type, event_hash), and
//    broadcasts. No FK to listings.
//
// 2. Legacy listing-linked notify (unchanged):
//    { listing_id, event_type, event_hash, message_body }
//    Still supported for clients that already upserted a listing.
//
// 3. Raw ad-hoc push:
//    { message_body }
//    No persistence, no dedup. For test pings.

export interface SendLineNotificationInput {
  message_body?: string;
  // legacy listing-linked
  listing_id?: string;
  event_type?: string;
  event_hash?: string;
  // new structured
  candidate?: Candidate;
  triage_base_url?: string;
}

export interface SendLineNotificationResult {
  status: "sent" | "failed" | "already_sent";
  notification_id: string | null;
}

export async function handleSendLineNotification(
  input: SendLineNotificationInput,
): Promise<SendLineNotificationResult> {
  // shape 1: structured candidate
  if (input.candidate && input.event_type && input.triage_base_url) {
    return structuredNotify({
      candidate: CandidateSchema.parse(input.candidate) as Candidate,
      event_type: input.event_type as EventType,
      triage_base_url: input.triage_base_url,
    });
  }

  // shape 2: legacy listing-linked
  if (input.listing_id && input.event_type && input.event_hash && input.message_body) {
    return legacyListingNotify({
      listing_id: input.listing_id,
      event_type: input.event_type,
      event_hash: input.event_hash,
      message_body: input.message_body,
    });
  }

  // shape 3: raw message_body only
  if (input.message_body) {
    const pushResult = await pushLineMessage(input.message_body);
    return { status: pushResult.status, notification_id: null };
  }

  throw new Error(
    "send_line_notification requires one of: {candidate,event_type,triage_base_url} | {listing_id,event_type,event_hash,message_body} | {message_body}",
  );
}

async function structuredNotify(input: {
  candidate: Candidate;
  event_type: EventType;
  triage_base_url: string;
}): Promise<SendLineNotificationResult> {
  const { candidate, event_type, triage_base_url } = input;

  if (candidate.score_level === "reject") {
    return { status: "already_sent", notification_id: null };
  }

  const event_hash = computeEventHash({
    event_type,
    source: candidate.listing_identity.source,
    source_listing_id: candidate.listing_identity.source_listing_id,
    payload: {
      rent_price: candidate.rent_price,
      score_level: candidate.score_level,
      photo_review: candidate.photo_review,
      appliance_review: candidate.appliance_review,
    },
  });

  const already = await hasPriorSourceNotification(
    candidate.listing_identity.source,
    candidate.listing_identity.source_listing_id,
    event_type,
    event_hash,
  );
  if (already) {
    return { status: "already_sent", notification_id: null };
  }

  const triage_url = `${triage_base_url.replace(/\/$/, "")}/listings/${candidate.listing_identity.source_listing_id}`;
  const message_body = renderMessage({
    event_type,
    candidate,
    triage_url,
  });

  const pushResult = await pushLineMessage(message_body);
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

async function legacyListingNotify(input: {
  listing_id: string;
  event_type: string;
  event_hash: string;
  message_body: string;
}): Promise<SendLineNotificationResult> {
  const already = await hasPriorSentNotification(
    input.listing_id,
    input.event_type,
    input.event_hash,
  );
  if (already) {
    throw new Error(
      `notification already sent for listing ${input.listing_id} event ${input.event_type} hash ${input.event_hash.slice(0, 8)}`,
    );
  }
  const pushResult = await pushLineMessage(input.message_body);
  const row = await insertNotification({
    listing_id: input.listing_id,
    event_type: input.event_type,
    event_hash: input.event_hash,
    message_body: input.message_body,
    status: pushResult.status,
    provider_response: pushResult.response,
  });
  return { status: pushResult.status, notification_id: row.id };
}

export type { ChangeType };
