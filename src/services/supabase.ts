import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadServerEnv } from "@/config/env";

let cached: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (cached) return cached;
  const env = loadServerEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function resetClientForTests(): void {
  cached = null;
}
