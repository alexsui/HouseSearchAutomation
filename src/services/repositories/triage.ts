import { getServerClient } from "@/services/supabase";

const ALLOWED_STATUSES = [
  "New",
  "Interested",
  "Contacted",
  "Viewing",
  "Rejected",
  "Archived",
] as const;
export type TriageStatus = (typeof ALLOWED_STATUSES)[number];

export async function upsertTriageStatus(
  listingId: string,
  status: string,
): Promise<void> {
  if (!ALLOWED_STATUSES.includes(status as TriageStatus))
    throw new Error(`invalid status: ${status}`);
  const supabase = getServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("triage_actions")
    .upsert(
      { listing_id: listingId, status, updated_at: now },
      { onConflict: "listing_id" },
    );
  if (error) throw new Error(error.message);
}

export async function upsertTriageNote(
  listingId: string,
  note: string,
): Promise<void> {
  const supabase = getServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("triage_actions")
    .upsert(
      { listing_id: listingId, note, updated_at: now },
      { onConflict: "listing_id" },
    );
  if (error) throw new Error(error.message);
}

export async function fetchTriage(
  listingId: string,
): Promise<{ status: string; note: string | null } | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("triage_actions")
    .select("status, note")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
