import { getServerClient } from "@/services/supabase";

export interface NotificationRow {
  id: string;
  listing_id: string | null;
  source: string | null;
  source_listing_id: string | null;
  event_type: string;
  event_hash: string;
  channel: string;
  message_body: string;
  status: "sent" | "failed";
  provider_response: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
}

export async function hasPriorSentNotification(
  listingId: string,
  eventType: string,
  eventHash: string,
): Promise<boolean> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("listing_id", listingId)
    .eq("event_type", eventType)
    .eq("event_hash", eventHash)
    .eq("status", "sent")
    .limit(1);
  if (error) throw new Error(`hasPriorSentNotification failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function hasPriorSourceNotification(
  source: string,
  sourceListingId: string,
): Promise<boolean> {
  // URL-only dedup: any prior successful notification for this listing —
  // regardless of event_type / event_hash / rent — blocks further notifies.
  // One LINE per listing, forever. Simpler than hashing and avoids drift.
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("source", source)
    .eq("source_listing_id", sourceListingId)
    .eq("status", "sent")
    .limit(1);
  if (error) throw new Error(`hasPriorSourceNotification failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function insertNotification(input: {
  listing_id?: string | null;
  source?: string | null;
  source_listing_id?: string | null;
  event_type: string;
  event_hash: string;
  message_body: string;
  status: "sent" | "failed";
  provider_response: Record<string, unknown> | null;
}): Promise<NotificationRow> {
  const supabase = getServerClient();
  const sent_at = input.status === "sent" ? new Date().toISOString() : null;
  const row = {
    listing_id: input.listing_id ?? null,
    source: input.source ?? null,
    source_listing_id: input.source_listing_id ?? null,
    event_type: input.event_type,
    event_hash: input.event_hash,
    message_body: input.message_body,
    status: input.status,
    provider_response: input.provider_response,
    channel: "line",
    sent_at,
  };
  const { data, error } = await supabase
    .from("notifications")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`insertNotification failed: ${error.message}`);
  return data as NotificationRow;
}
