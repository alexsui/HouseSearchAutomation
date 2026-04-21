import { describe, it, expect, beforeEach } from "vitest";
import { loadServerEnv } from "@/config/env";

describe("loadServerEnv", () => {
  const base = {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_CHAT_ID: "123456789",
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
    expect(env.TELEGRAM_BOT_TOKEN).toBe("bot-token");
    expect(env.TELEGRAM_CHAT_ID).toBe("123456789");
  });

  it("throws with list of missing vars", () => {
    expect(() => loadServerEnv()).toThrowError(/AUTOMATION_SECRET/);
  });

  it("requires TELEGRAM_CHAT_ID", () => {
    Object.assign(process.env, base);
    delete process.env.TELEGRAM_CHAT_ID;
    expect(() => loadServerEnv()).toThrowError(/TELEGRAM_CHAT_ID/);
  });
});
