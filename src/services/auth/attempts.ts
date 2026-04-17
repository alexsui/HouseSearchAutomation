import { getServerClient } from "@/services/supabase";

export const THROTTLE_MAX = 10;
export const THROTTLE_WINDOW_SECONDS = 15 * 60;

export async function isIpThrottled(ipHash: string): Promise<boolean> {
  const supabase = getServerClient();
  const since = new Date(Date.now() - THROTTLE_WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabase
    .from("login_attempts")
    .select("id", { head: true, count: "exact" })
    .eq("ip_hash", ipHash)
    .eq("success", false)
    .gte("attempted_at", since);
  if (error) throw new Error(`isIpThrottled failed: ${error.message}`);
  return (count ?? 0) >= THROTTLE_MAX;
}

export async function recordAttempt(ipHash: string, success: boolean): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase
    .from("login_attempts")
    .insert({ ip_hash: ipHash, success });
  if (error) throw new Error(`recordAttempt failed: ${error.message}`);
}
