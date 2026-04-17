import { describe, it, expect, beforeAll } from "vitest";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { config } from "dotenv";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

describe("supabase client smoke", () => {
  it("can query listings table", async () => {
    const supabase = getServerClient();
    const { error } = await supabase.from("listings").select("id").limit(1);
    expect(error).toBeNull();
  });
});
