import { getServerClient } from "@/services/supabase";

export interface KnownListing {
  source_listing_id: string;
  source_url: string;
  last_seen_at: string;
  rent_price: number;
  current_status: string;
  score_level: string | null;
  photo_review: string | null;
  appliance_review: string | null;
}

export async function handleGetKnownListings(input: {
  source: "591";
  since?: string;
}): Promise<KnownListing[]> {
  const supabase = getServerClient();

  let query = supabase
    .from("listings")
    .select(
      `source_listing_id, source_url, last_seen_at, rent_price, current_status,
       listing_reviews ( score_level, photo_review, appliance_review, reviewed_at )`,
    )
    .eq("source", input.source)
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (input.since) query = query.gte("last_seen_at", input.since);

  const { data, error } = await query;
  if (error) throw new Error(`handleGetKnownListings failed: ${error.message}`);

  return (data ?? []).map((row) => {
    const reviews = (row.listing_reviews ?? []) as Array<{
      score_level: string;
      photo_review: string;
      appliance_review: string;
      reviewed_at: string;
    }>;
    const latest = reviews.sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1))[0] ?? null;
    return {
      source_listing_id: row.source_listing_id,
      source_url: row.source_url,
      last_seen_at: row.last_seen_at,
      rent_price: row.rent_price,
      current_status: row.current_status,
      score_level: latest?.score_level ?? null,
      photo_review: latest?.photo_review ?? null,
      appliance_review: latest?.appliance_review ?? null,
    };
  });
}
