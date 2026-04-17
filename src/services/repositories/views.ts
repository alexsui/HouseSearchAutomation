import { getServerClient } from "@/services/supabase";

export interface CandidateListRow {
  listing_id: string;
  source_listing_id: string;
  source_url: string;
  title: string;
  district: string;
  rent_price: number;
  layout: string;
  last_seen_at: string;
  score_level: string | null;
  photo_review: string | null;
  appliance_review: string | null;
  triage_status: string;
  triage_note: string | null;
  last_notified_at: string | null;
}

export interface CandidateListFilter {
  status?: string;
  scoreLevel?: string;
  district?: string;
  sort?: "notified" | "seen";
}

export async function fetchCandidateList(
  filter: CandidateListFilter,
): Promise<CandidateListRow[]> {
  const supabase = getServerClient();

  const { data: notified, error: notifiedErr } = await supabase
    .from("notifications")
    .select("listing_id, sent_at")
    .eq("status", "sent");
  if (notifiedErr) throw new Error(notifiedErr.message);

  const ids = Array.from(new Set((notified ?? []).map((n) => n.listing_id)));
  if (ids.length === 0) return [];

  const lastNotifiedByListing = new Map<string, string>();
  for (const row of notified ?? []) {
    const prev = lastNotifiedByListing.get(row.listing_id);
    if (!prev || (row.sent_at && row.sent_at > prev)) {
      if (row.sent_at) lastNotifiedByListing.set(row.listing_id, row.sent_at);
    }
  }

  let query = supabase
    .from("listings")
    .select(
      `id, source_listing_id, source_url, title, district, rent_price, layout, last_seen_at,
       listing_reviews ( score_level, photo_review, appliance_review, reviewed_at ),
       triage_actions ( status, note )`,
    )
    .in("id", ids);

  if (filter.district) query = query.eq("district", filter.district);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const reviews = ((row.listing_reviews ?? []) as Array<{
      score_level: string;
      photo_review: string;
      appliance_review: string;
      reviewed_at: string;
    }>).sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1));
    const latest = reviews[0] ?? null;
    const triage = (row.triage_actions ?? [])[0] as
      | { status: string; note: string | null }
      | undefined;
    return {
      listing_id: row.id,
      source_listing_id: row.source_listing_id,
      source_url: row.source_url,
      title: row.title,
      district: row.district,
      rent_price: row.rent_price,
      layout: row.layout,
      last_seen_at: row.last_seen_at,
      score_level: latest?.score_level ?? null,
      photo_review: latest?.photo_review ?? null,
      appliance_review: latest?.appliance_review ?? null,
      triage_status: triage?.status ?? "New",
      triage_note: triage?.note ?? null,
      last_notified_at: lastNotifiedByListing.get(row.id) ?? null,
    };
  });

  const filtered = rows.filter(
    (r) =>
      (!filter.status || r.triage_status === filter.status) &&
      (!filter.scoreLevel || r.score_level === filter.scoreLevel),
  );

  const sortKey = filter.sort ?? "notified";
  filtered.sort((a, b) => {
    if (sortKey === "seen") return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
    return (b.last_notified_at ?? "").localeCompare(a.last_notified_at ?? "");
  });
  return filtered;
}

export interface CandidateDetail {
  listing: {
    id: string;
    source_listing_id: string;
    source_url: string;
    title: string;
    district: string;
    rent_price: number;
    layout: string;
    address_summary: string;
    area_ping: number | null;
    floor: string | null;
    first_seen_at: string;
    last_seen_at: string;
    current_status: string;
  };
  reviews: Array<{
    id: string;
    reviewed_at: string;
    score_level: string;
    photo_review: string;
    appliance_review: string;
    appliances_seen: string[];
    appliances_missing_or_unknown: string[];
    recommendation_reason: string;
    concerns: string[];
  }>;
  notifications: Array<{
    id: string;
    event_type: string;
    status: string;
    sent_at: string | null;
    created_at: string;
  }>;
  changes: Array<{
    id: string;
    change_type: string;
    change_summary: string;
    created_at: string;
  }>;
  triage: { status: string; note: string | null };
}

export async function fetchCandidateDetail(listingId: string): Promise<CandidateDetail | null> {
  const supabase = getServerClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "id, source_listing_id, source_url, title, district, rent_price, layout, address_summary, area_ping, floor, first_seen_at, last_seen_at, current_status",
    )
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return null;

  const [{ data: reviews }, { data: notifications }, { data: changes }, { data: triage }] =
    await Promise.all([
      supabase
        .from("listing_reviews")
        .select("*")
        .eq("listing_id", listingId)
        .order("reviewed_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("id, event_type, status, sent_at, created_at")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("listing_changes")
        .select("id, change_type, change_summary, created_at")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("triage_actions")
        .select("status, note")
        .eq("listing_id", listingId)
        .maybeSingle(),
    ]);

  return {
    listing: listing as CandidateDetail["listing"],
    reviews: (reviews ?? []) as CandidateDetail["reviews"],
    notifications: (notifications ?? []) as CandidateDetail["notifications"],
    changes: (changes ?? []) as CandidateDetail["changes"],
    triage: triage ?? { status: "New", note: null },
  };
}
