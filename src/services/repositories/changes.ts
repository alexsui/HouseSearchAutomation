import { getServerClient } from "@/services/supabase";
import type { ChangeType } from "@/domain/types";

export interface ChangeRow {
  id: string;
  listing_id: string;
  run_id: string;
  change_type: ChangeType;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  change_summary: string;
  created_at: string;
}

export async function insertChange(input: {
  listing_id: string;
  run_id: string;
  change_type: Exclude<ChangeType, "none">;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  change_summary: string;
}): Promise<ChangeRow> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listing_changes")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`insertChange failed: ${error.message}`);
  return data as ChangeRow;
}
