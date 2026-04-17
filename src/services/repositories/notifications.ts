import { getServerClient } from "@/services/supabase";

export interface NotificationRow {
  id: string;
  listing_id: string;
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

export async function insertNotification(input: {
  listing_id: string;
  event_type: string;
  event_hash: string;
  message_body: string;
  status: "sent" | "failed";
  provider_response: Record<string, unknown> | null;
}): Promise<NotificationRow> {
  const supabase = getServerClient();
  const sent_at = input.status === "sent" ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("notifications")
    .insert({ ...input, channel: "line", sent_at })
    .select()
    .single();
  if (error) throw new Error(`insertNotification failed: ${error.message}`);
  return data as NotificationRow;
}
