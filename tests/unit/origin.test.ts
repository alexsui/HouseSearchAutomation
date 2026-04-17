import { describe, it, expect, beforeEach } from "vitest";
import { assertSameOrigin } from "@/services/auth/origin";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
  process.env.SESSION_SIGNING_SECRET = "a".repeat(32);
  process.env.TRIAGE_PASSWORD = "hunter2-long";
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "t";
  process.env.AUTOMATION_SECRET = "0".repeat(32);
});

describe("assertSameOrigin", () => {
  it("accepts matching Origin", () => {
    const req = new Request("https://app.example.com/api/x", {
      method: "POST",
      headers: { origin: "https://app.example.com" },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("rejects mismatched Origin", () => {
    const req = new Request("https://app.example.com/api/x", {
      method: "POST",
      headers: { origin: "https://evil.example.com" },
    });
    expect(() => assertSameOrigin(req)).toThrow();
  });

  it("falls back to Referer when Origin absent", () => {
    const req = new Request("https://app.example.com/api/x", {
      method: "POST",
      headers: { referer: "https://app.example.com/" },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("rejects when both headers absent", () => {
    const req = new Request("https://app.example.com/api/x", { method: "POST" });
    expect(() => assertSameOrigin(req)).toThrow();
  });
});
