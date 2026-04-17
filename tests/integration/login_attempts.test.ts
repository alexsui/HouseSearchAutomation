import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import {
  isIpThrottled,
  recordAttempt,
  THROTTLE_MAX,
  THROTTLE_WINDOW_SECONDS,
} from "@/services/auth/attempts";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("login_attempts").delete().neq("ip_hash", "__never__");
});

describe("login throttle", () => {
  it("is not throttled with zero attempts", async () => {
    expect(await isIpThrottled("abc")).toBe(false);
  });

  it("is not throttled when under the limit", async () => {
    for (let i = 0; i < THROTTLE_MAX - 1; i++) await recordAttempt("abc", false);
    expect(await isIpThrottled("abc")).toBe(false);
  });

  it("is throttled at the limit within the window", async () => {
    for (let i = 0; i < THROTTLE_MAX; i++) await recordAttempt("abc", false);
    expect(await isIpThrottled("abc")).toBe(true);
  });

  it("ignores attempts outside the window", async () => {
    const supabase = getServerClient();
    const past = new Date(Date.now() - (THROTTLE_WINDOW_SECONDS + 60) * 1000).toISOString();
    for (let i = 0; i < THROTTLE_MAX; i++) {
      await supabase.from("login_attempts").insert({ ip_hash: "abc", success: false, attempted_at: past });
    }
    expect(await isIpThrottled("abc")).toBe(false);
  });
});
