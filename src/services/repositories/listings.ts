import { getServerClient } from "@/services/supabase";
import type { Candidate } from "@/domain/types";

export interface ListingRow {
  id: string;
  source: string;
  source_listing_id: string;
  source_url: string;
  title: string;
  rent_price: number;
  district: string;
  address_summary: string;
  layout: string;
  area_ping: number | null;
  floor: string | null;
  raw_snapshot: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  current_status: string;
  created_at: string;
  updated_at: string;
}

export async function findListingByIdentity(
  source: string,
  sourceListingId: string,
): Promise<ListingRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("source", source)
    .eq("source_listing_id", sourceListingId)
    .maybeSingle();
  if (error) throw new Error(`findListingByIdentity failed: ${error.message}`);
  return (data as ListingRow | null) ?? null;
}

export async function upsertListing(candidate: Candidate): Promise<ListingRow> {
  const supabase = getServerClient();
  const id = candidate.listing_identity;
  const now = new Date().toISOString();

  const existing = await findListingByIdentity(id.source, id.source_listing_id);
  const first_seen_at = existing?.first_seen_at ?? now;

  const { data, error } = await supabase
    .from("listings")
    .upsert(
      {
        source: id.source,
        source_listing_id: id.source_listing_id,
        source_url: id.source_url,
        title: candidate.title,
        rent_price: candidate.rent_price,
        district: candidate.district,
        address_summary: candidate.address_summary,
        layout: candidate.layout,
        area_ping: candidate.area_ping,
        floor: candidate.floor,
        raw_snapshot: candidate,
        first_seen_at,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "source,source_listing_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`upsertListing failed: ${error.message}`);
  return data as ListingRow;
}
