import { getServerClient } from "@/services/supabase";
import type { Candidate } from "@/domain/types";

export interface ReviewRow {
  id: string;
  listing_id: string;
  run_id: string;
  score_level: string;
  photo_review: string;
  appliance_review: string;
  appliances_seen: string[];
  appliances_missing_or_unknown: string[];
  recommendation_reason: string;
  concerns: string[];
  reviewed_at: string;
}

export async function insertReview(input: {
  listing_id: string;
  run_id: string;
  candidate: Candidate;
}): Promise<ReviewRow> {
  const { listing_id, run_id, candidate } = input;
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listing_reviews")
    .insert({
      listing_id,
      run_id,
      score_level: candidate.score_level,
      photo_review: candidate.photo_review,
      appliance_review: candidate.appliance_review,
      appliances_seen: candidate.appliances_seen,
      appliances_missing_or_unknown: candidate.appliances_missing_or_unknown,
      recommendation_reason: candidate.recommendation_reason,
      concerns: candidate.concerns,
    })
    .select()
    .single();
  if (error) throw new Error(`insertReview failed: ${error.message}`);
  return data as ReviewRow;
}

export async function fetchLatestReview(listingId: string): Promise<ReviewRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listing_reviews")
    .select("*")
    .eq("listing_id", listingId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fetchLatestReview failed: ${error.message}`);
  return (data as ReviewRow | null) ?? null;
}
