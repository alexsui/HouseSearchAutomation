import { describe, it, expect, beforeEach } from "vitest";
import { loadServerEnv } from "@/config/env";

describe("loadServerEnv", () => {
  const base = {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    LINE_CHANNEL_ACCESS_TOKEN: "t",
    AUTOMATION_SECRET: "s-at-least-sixteen-chars",
    TRIAGE_PASSWORD: "hunter2-long-enough",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    SESSION_SIGNING_SECRET: "0".repeat(32),
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

  it("requires TRIAGE_PASSWORD", () => {
    Object.assign(process.env, base);
    delete process.env.TRIAGE_PASSWORD;
    expect(() => loadServerEnv()).toThrowError(/TRIAGE_PASSWORD/);
  });

  it("parses triage env vars when set", () => {
    Object.assign(process.env, base);
    const env = loadServerEnv();
    expect(env.TRIAGE_PASSWORD).toBe("hunter2-long-enough");
    expect(env.SESSION_SIGNING_SECRET).toBe("0".repeat(32));
  });
});
