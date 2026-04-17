import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { POST as loginPOST } from "@/app/api/auth/login/route";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("login_attempts").delete().neq("ip_hash", "__never__");
});

function makeReq(password: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.NEXT_PUBLIC_SITE_URL!,
      "x-forwarded-for": "1.2.3.4",
    },
    body: JSON.stringify({ password }),
  });
}

describe("login route", () => {
  it("sets cookie on correct password", async () => {
    const res = await loginPOST(makeReq(process.env.TRIAGE_PASSWORD!));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/triage_session=/);
  });

  it("401 on wrong password and records attempt", async () => {
    const res = await loginPOST(makeReq("wrong"));
    expect(res.status).toBe(401);
    const supabase = getServerClient();
    const { data } = await supabase
      .from("login_attempts")
      .select("success")
      .eq("success", false);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("429 when IP is throttled", async () => {
    for (let i = 0; i < 10; i++) await loginPOST(makeReq("wrong"));
    const res = await loginPOST(makeReq(process.env.TRIAGE_PASSWORD!));
    expect(res.status).toBe(429);
  });

  it("403 on mismatched origin", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({ password: process.env.TRIAGE_PASSWORD! }),
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(403);
  });
});
