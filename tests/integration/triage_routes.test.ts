import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { POST as statusPOST } from "@/app/api/triage/status/route";
import { POST as notePOST } from "@/app/api/triage/note/route";
import { signSession, SESSION_COOKIE_NAME } from "@/services/auth/cookie";
import { validCandidate } from "../fixtures/candidates";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("listings").delete().eq("source", "591");
});

async function sessionCookie(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signSession({ issuedAt: now, expiresAt: now + 3600 });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function req(body: unknown, opts: { cookie?: string; origin?: string } = {}): Request {
  return new Request("http://localhost/api/triage/x", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: opts.origin ?? process.env.NEXT_PUBLIC_SITE_URL!,
      cookie: opts.cookie ?? "",
    },
    body: JSON.stringify(body),
  });
}

describe("triage status route", () => {
  it("updates status with valid session + origin", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    const res = await statusPOST(
      req({ listing_id: up.listing_id, status: "Interested" }, { cookie: await sessionCookie() }),
    );
    expect(res.status).toBe(200);
  });

  it("401 without session cookie", async () => {
    const res = await statusPOST(req({ listing_id: "00000000-0000-0000-0000-000000000000", status: "Interested" }));
    expect(res.status).toBe(401);
  });

  it("403 on bad origin", async () => {
    const res = await statusPOST(
      req(
        { listing_id: "00000000-0000-0000-0000-000000000000", status: "Interested" },
        { cookie: await sessionCookie(), origin: "https://evil.example.com" },
      ),
    );
    expect(res.status).toBe(403);
  });
});

describe("triage note route", () => {
  it("updates note with valid session + origin", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    const res = await notePOST(
      req({ listing_id: up.listing_id, note: "hello" }, { cookie: await sessionCookie() }),
    );
    expect(res.status).toBe(200);
  });
});
