import { describe, it, expect, beforeEach } from "vitest";
import { loadServerEnv } from "@/config/env";

describe("loadServerEnv", () => {
  const base = {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    LINE_CHANNEL_ACCESS_TOKEN: "t",
    LINE_USER_ID: "U123",
    AUTOMATION_SECRET: "s-at-least-sixteen-chars",
  };

  beforeEach(() => {
    for (const k of Object.keys(base)) delete process.env[k];
  });

  it("returns parsed config when all vars present", () => {
    Object.assign(process.env, base);
    const env = loadServerEnv();
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
    expect(env.AUTOMATION_SECRET).toBe("s-at-least-sixteen-chars");
  });

  it("throws with list of missing vars", () => {
    expect(() => loadServerEnv()).toThrowError(/AUTOMATION_SECRET/);
  });
});
