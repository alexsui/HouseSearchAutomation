# Triage Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the password-protected Next.js triage UI that renders notification-selected listings with filters, detail pages, and status/note editing — all through Vercel server components/actions with CSRF-safe writes.

**Architecture:** Same Next.js 15 project from Plan 1. Pages under `src/app/(triage)/`. Auth is a signed `HttpOnly` cookie set by a server route after password check. A small Supabase-backed `login_attempts` table rate-limits failed logins by IP hash. State-changing writes use POST server actions guarded by an origin check. All Supabase access is server-side (service-role key never reaches the browser). MCP route from Plan 1 stays isolated under `/api/mcp`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS (for minimal styling), `jose` for signed cookies, Zod, Vitest for unit tests, Playwright for one browser smoke test.

**Branch:** `feat/plan-2-triage`.

**Depends on:** Plan 1 complete and deployed. Dev + prod Supabase schemas already have `listings`, `listing_reviews`, `listing_changes`, `notifications`, `triage_actions`. The `login_attempts` table is added in Task 1.

---

## File Structure

```
src/
├── app/
│   ├── (triage)/
│   │   ├── layout.tsx                # triage shell with logout
│   │   ├── page.tsx                  # list page
│   │   └── listings/[id]/page.tsx    # detail page
│   ├── login/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── logout/route.ts
│   │   ├── triage/
│   │   │   ├── status/route.ts       # POST status update
│   │   │   └── note/route.ts         # POST note update
│   │   └── mcp/route.ts              # from Plan 1 — untouched
│   └── middleware.ts                 # redirects unauth'd triage requests to /login
├── services/
│   ├── auth/
│   │   ├── cookie.ts                 # sign/verify session token
│   │   ├── attempts.ts               # login_attempts repo
│   │   └── origin.ts                 # CSRF origin check
│   └── repositories/
│       ├── triage.ts                 # status + note upsert
│       └── views.ts                  # list + detail view queries (joined)
└── ui/
    ├── Filters.tsx
    ├── ListingCard.tsx
    ├── StatusPicker.tsx
    └── NoteEditor.tsx
tests/
├── unit/
│   ├── cookie.test.ts
│   ├── attempts.test.ts
│   ├── origin.test.ts
│   └── views.test.ts
├── integration/
│   ├── login_route.test.ts
│   ├── status_route.test.ts
│   └── note_route.test.ts
└── e2e/
    └── triage.spec.ts                # Playwright
supabase/
└── migrations/
    └── 20260417000000_login_attempts.sql
```

---

## Task 1: login_attempts migration

**Files:**
- Create: `supabase/migrations/20260417000000_login_attempts.sql`

- [ ] **Step 1: Write migration**

```sql
create table login_attempts (
  id uuid primary key default uuid_generate_v4(),
  ip_hash text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
create index login_attempts_ip_hash_attempted_at_idx
  on login_attempts (ip_hash, attempted_at desc);
```

- [ ] **Step 2: Apply to dev**

Run:
```bash
supabase link --project-ref <dev-ref>
supabase db push
```

Verify the table exists in Supabase Studio.

- [ ] **Step 3: Commit**

```bash
git checkout -b feat/plan-2-triage
git add supabase/migrations/20260417000000_login_attempts.sql
git commit -m "feat: add login_attempts table for triage auth rate limit"
```

---

## Task 2: Env var additions

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.local.example`, `.env.local`
- Test: `tests/unit/env.test.ts`

- [ ] **Step 1: Update tests**

Add to `tests/unit/env.test.ts`:

```ts
it("requires TRIAGE_PASSWORD and NEXT_PUBLIC_SITE_URL", () => {
  Object.assign(process.env, base);
  delete process.env.TRIAGE_PASSWORD;
  expect(() => loadServerEnv()).toThrowError(/TRIAGE_PASSWORD/);
});

it("parses triage env vars when set", () => {
  Object.assign(process.env, base, {
    TRIAGE_PASSWORD: "hunter2-long-enough",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    SESSION_SIGNING_SECRET: "0".repeat(32),
  });
  const env = loadServerEnv();
  expect(env.TRIAGE_PASSWORD).toBe("hunter2-long-enough");
});
```

Also update the `base` constant to include:
```ts
TRIAGE_PASSWORD: "hunter2-long-enough",
NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
SESSION_SIGNING_SECRET: "0".repeat(32),
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/unit/env.test.ts`
Expected: FAIL for the new cases.

- [ ] **Step 3: Extend schema**

Edit `src/config/env.ts` — add to the Zod object:

```ts
TRIAGE_PASSWORD: z.string().min(8),
NEXT_PUBLIC_SITE_URL: z.string().url(),
SESSION_SIGNING_SECRET: z.string().min(32),
```

- [ ] **Step 4: Update .env.local.example**

Add:
```
TRIAGE_PASSWORD=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SESSION_SIGNING_SECRET=
```

Generate a signing secret: `openssl rand -hex 32` → paste into `.env.local`.

- [ ] **Step 5: Tests pass**

Run: `pnpm test tests/unit/env.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts tests/unit/env.test.ts .env.local.example
git commit -m "feat: require triage + session env vars"
```

---

## Task 3: Signed session cookie

**Files:**
- Create: `src/services/auth/cookie.ts`
- Test: `tests/unit/cookie.test.ts`

- [ ] **Step 1: Install jose**

Run: `pnpm add jose`

- [ ] **Step 2: Write failing tests**

Create `tests/unit/cookie.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { signSession, verifySession } from "@/services/auth/cookie";

beforeEach(() => {
  process.env.SESSION_SIGNING_SECRET = "a".repeat(32);
});

describe("session cookie", () => {
  it("round-trips a valid token", async () => {
    const token = await signSession({ issuedAt: 1000, expiresAt: 2000 });
    const payload = await verifySession(token);
    expect(payload?.expiresAt).toBe(2000);
  });

  it("rejects a token with wrong signature", async () => {
    const token = await signSession({ issuedAt: 1000, expiresAt: 2000 });
    const tampered = token.slice(0, -4) + "aaaa";
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession({
      issuedAt: 1000,
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });
    expect(await verifySession(token)).toBeNull();
  });
});
```

- [ ] **Step 3: Run, confirm fails**

Run: `pnpm test tests/unit/cookie.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

Create `src/services/auth/cookie.ts`:

```ts
import { jwtVerify, SignJWT } from "jose";
import { loadServerEnv } from "@/config/env";

export const SESSION_COOKIE_NAME = "triage_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  issuedAt: number;
  expiresAt: number;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(loadServerEnv().SESSION_SIGNING_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(payload.issuedAt)
    .setExpirationTime(payload.expiresAt)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.issuedAt !== "number" || typeof payload.expiresAt !== "number") return null;
    return { issuedAt: payload.issuedAt, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Tests pass**

Run: `pnpm test tests/unit/cookie.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/services/auth/cookie.ts tests/unit/cookie.test.ts package.json pnpm-lock.yaml
git commit -m "feat: signed HS256 session cookie with TTL"
```

---

## Task 4: Login attempts repository + rate limit

**Files:**
- Create: `src/services/auth/attempts.ts`
- Test: `tests/integration/login_attempts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/login_attempts.test.ts`:

```ts
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
```

- [ ] **Step 2: Implement**

Create `src/services/auth/attempts.ts`:

```ts
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
```

- [ ] **Step 3: Tests pass**

Run: `pnpm test tests/integration/login_attempts.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/services/auth/attempts.ts tests/integration/login_attempts.test.ts
git commit -m "feat: login attempt tracking and sliding-window throttle"
```

---

## Task 5: Origin check helper

**Files:**
- Create: `src/services/auth/origin.ts`
- Test: `tests/unit/origin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/origin.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { assertSameOrigin } from "@/services/auth/origin";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
  process.env.SESSION_SIGNING_SECRET = "a".repeat(32);
  process.env.TRIAGE_PASSWORD = "hunter2-long";
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "t";
  process.env.LINE_USER_ID = "U";
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
```

- [ ] **Step 2: Implement**

Create `src/services/auth/origin.ts`:

```ts
import { loadServerEnv } from "@/config/env";

export function assertSameOrigin(req: Request): void {
  const allowed = loadServerEnv().NEXT_PUBLIC_SITE_URL;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== allowed) throw new Error(`invalid origin: ${origin}`);
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    const refererOrigin = new URL(referer).origin;
    if (refererOrigin !== allowed) throw new Error(`invalid referer: ${refererOrigin}`);
    return;
  }
  throw new Error("missing Origin or Referer header");
}
```

- [ ] **Step 3: Tests pass**

Run: `pnpm test tests/unit/origin.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/services/auth/origin.ts tests/unit/origin.test.ts
git commit -m "feat: same-origin guard for state-changing routes"
```

---

## Task 6: Login + logout routes

**Files:**
- Create: `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`
- Create: `src/services/auth/hash.ts`
- Test: `tests/integration/login_route.test.ts`

- [ ] **Step 1: Write IP hash helper**

Create `src/services/auth/hash.ts`:

```ts
import { createHash } from "node:crypto";

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
```

- [ ] **Step 2: Write failing test**

Create `tests/integration/login_route.test.ts`:

```ts
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
```

Note: update `.env.local` to set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so the test's Origin matches.

- [ ] **Step 3: Implement login route**

Create `src/app/api/auth/login/route.ts`:

```ts
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSession,
} from "@/services/auth/cookie";
import { assertSameOrigin } from "@/services/auth/origin";
import { isIpThrottled, recordAttempt } from "@/services/auth/attempts";
import { getClientIp, hashIp } from "@/services/auth/hash";
import { loadServerEnv } from "@/config/env";

const Body = z.object({ password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }

  const ipHash = hashIp(getClientIp(req));
  if (await isIpThrottled(ipHash)) {
    return new Response(JSON.stringify({ error: "too many attempts" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  const env = loadServerEnv();
  const ok = parsed.data.password === env.TRIAGE_PASSWORD;
  await recordAttempt(ipHash, ok);
  if (!ok) return new Response(null, { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  const token = await signSession({ issuedAt: now, expiresAt: now + SESSION_TTL_SECONDS });
  const cookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
}
```

- [ ] **Step 4: Implement logout route**

Create `src/app/api/auth/logout/route.ts`:

```ts
import { SESSION_COOKIE_NAME } from "@/services/auth/cookie";
import { assertSameOrigin } from "@/services/auth/origin";

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }
  const cookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
}
```

- [ ] **Step 5: Tests pass**

Run: `pnpm test tests/integration/login_route.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/services/auth/hash.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts tests/integration/login_route.test.ts
git commit -m "feat: login + logout routes with throttle and origin check"
```

---

## Task 7: Auth middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Implement**

Create `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/services/auth/cookie";

const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/api\/auth\//, /^\/api\/mcp(\/|$)/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySession(token) : null;
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Manually verify**

Run: `pnpm dev`. Visit `http://localhost:3000/` — should redirect to `/login`. Visit `/api/mcp` with a valid bearer — should still work (MCP is public from the middleware's perspective; auth is inside the route).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: middleware redirects unauth'd pages to /login"
```

---

## Task 8: Triage views (server data access)

**Files:**
- Create: `src/services/repositories/views.ts`
- Test: `tests/unit/views.test.ts` (shape only) + `tests/integration/views.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/views.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import {
  fetchCandidateList,
  fetchCandidateDetail,
} from "@/services/repositories/views";
import { validCandidate } from "../fixtures/candidates";
import { mockFetchOk } from "../fixtures/line_mock";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("listings").delete().eq("source", "591");
});

describe("triage views", () => {
  it("list excludes listings that were never notified", async () => {
    await handleUpsertListing({
      candidate: { ...validCandidate, score_level: "reject" },
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    const list = await fetchCandidateList({});
    expect(list).toEqual([]);
  });

  it("list includes listings with at least one notification", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    const list = await fetchCandidateList({});
    expect(list).toHaveLength(1);
    expect(list[0]!.source_listing_id).toBe("abc123");
  });

  it("list filters by score_level", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    expect(await fetchCandidateList({ scoreLevel: "strong" })).toHaveLength(1);
    expect(await fetchCandidateList({ scoreLevel: "loose" })).toHaveLength(0);
  });

  it("detail returns listing + reviews + notifications + changes", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    const detail = await fetchCandidateDetail(up.listing_id);
    expect(detail?.listing.source_listing_id).toBe("abc123");
    expect(detail?.reviews.length).toBeGreaterThan(0);
    expect(detail?.notifications.length).toBe(1);
    expect(detail?.changes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement views**

Create `src/services/repositories/views.ts`:

```ts
import { getServerClient } from "@/services/supabase";

export interface CandidateListRow {
  listing_id: string;
  source_listing_id: string;
  source_url: string;
  title: string;
  district: string;
  rent_price: number;
  layout: string;
  last_seen_at: string;
  score_level: string | null;
  photo_review: string | null;
  appliance_review: string | null;
  triage_status: string;
  triage_note: string | null;
  last_notified_at: string | null;
}

export interface CandidateListFilter {
  status?: string;
  scoreLevel?: string;
  district?: string;
  sort?: "notified" | "seen";
}

export async function fetchCandidateList(
  filter: CandidateListFilter,
): Promise<CandidateListRow[]> {
  const supabase = getServerClient();

  const { data: notified, error: notifiedErr } = await supabase
    .from("notifications")
    .select("listing_id, sent_at")
    .eq("status", "sent");
  if (notifiedErr) throw new Error(notifiedErr.message);

  const ids = Array.from(new Set((notified ?? []).map((n) => n.listing_id)));
  if (ids.length === 0) return [];

  const lastNotifiedByListing = new Map<string, string>();
  for (const row of notified ?? []) {
    const prev = lastNotifiedByListing.get(row.listing_id);
    if (!prev || (row.sent_at && row.sent_at > prev)) {
      if (row.sent_at) lastNotifiedByListing.set(row.listing_id, row.sent_at);
    }
  }

  let query = supabase
    .from("listings")
    .select(
      `id, source_listing_id, source_url, title, district, rent_price, layout, last_seen_at,
       listing_reviews ( score_level, photo_review, appliance_review, reviewed_at ),
       triage_actions ( status, note )`,
    )
    .in("id", ids);

  if (filter.district) query = query.eq("district", filter.district);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => {
    const reviews = ((row.listing_reviews ?? []) as Array<{
      score_level: string;
      photo_review: string;
      appliance_review: string;
      reviewed_at: string;
    }>).sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1));
    const latest = reviews[0] ?? null;
    const triage = (row.triage_actions ?? [])[0] as
      | { status: string; note: string | null }
      | undefined;
    return {
      listing_id: row.id,
      source_listing_id: row.source_listing_id,
      source_url: row.source_url,
      title: row.title,
      district: row.district,
      rent_price: row.rent_price,
      layout: row.layout,
      last_seen_at: row.last_seen_at,
      score_level: latest?.score_level ?? null,
      photo_review: latest?.photo_review ?? null,
      appliance_review: latest?.appliance_review ?? null,
      triage_status: triage?.status ?? "New",
      triage_note: triage?.note ?? null,
      last_notified_at: lastNotifiedByListing.get(row.id) ?? null,
    };
  });

  const filtered = rows.filter(
    (r) =>
      (!filter.status || r.triage_status === filter.status) &&
      (!filter.scoreLevel || r.score_level === filter.scoreLevel),
  );

  const sortKey = filter.sort ?? "notified";
  filtered.sort((a, b) => {
    if (sortKey === "seen") return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
    return (b.last_notified_at ?? "").localeCompare(a.last_notified_at ?? "");
  });
  return filtered;
}

export interface CandidateDetail {
  listing: {
    id: string;
    source_listing_id: string;
    source_url: string;
    title: string;
    district: string;
    rent_price: number;
    layout: string;
    address_summary: string;
    area_ping: number | null;
    floor: string | null;
    first_seen_at: string;
    last_seen_at: string;
    current_status: string;
  };
  reviews: Array<{
    id: string;
    reviewed_at: string;
    score_level: string;
    photo_review: string;
    appliance_review: string;
    appliances_seen: string[];
    appliances_missing_or_unknown: string[];
    recommendation_reason: string;
    concerns: string[];
  }>;
  notifications: Array<{
    id: string;
    event_type: string;
    status: string;
    sent_at: string | null;
    created_at: string;
  }>;
  changes: Array<{
    id: string;
    change_type: string;
    change_summary: string;
    created_at: string;
  }>;
  triage: { status: string; note: string | null };
}

export async function fetchCandidateDetail(listingId: string): Promise<CandidateDetail | null> {
  const supabase = getServerClient();
  const { data: listing } = await supabase
    .from("listings")
    .select(
      "id, source_listing_id, source_url, title, district, rent_price, layout, address_summary, area_ping, floor, first_seen_at, last_seen_at, current_status",
    )
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return null;

  const [{ data: reviews }, { data: notifications }, { data: changes }, { data: triage }] =
    await Promise.all([
      supabase
        .from("listing_reviews")
        .select("*")
        .eq("listing_id", listingId)
        .order("reviewed_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("id, event_type, status, sent_at, created_at")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("listing_changes")
        .select("id, change_type, change_summary, created_at")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("triage_actions")
        .select("status, note")
        .eq("listing_id", listingId)
        .maybeSingle(),
    ]);

  return {
    listing: listing as CandidateDetail["listing"],
    reviews: (reviews ?? []) as CandidateDetail["reviews"],
    notifications: (notifications ?? []) as CandidateDetail["notifications"],
    changes: (changes ?? []) as CandidateDetail["changes"],
    triage: triage ?? { status: "New", note: null },
  };
}
```

- [ ] **Step 3: Tests pass**

Run: `pnpm test tests/integration/views.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/services/repositories/views.ts tests/integration/views.test.ts
git commit -m "feat: triage list + detail data access with filter and sort"
```

---

## Task 9: Triage repository (status + note upsert)

**Files:**
- Create: `src/services/repositories/triage.ts`
- Test: `tests/integration/triage_repo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/triage_repo.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import {
  upsertTriageStatus,
  upsertTriageNote,
  fetchTriage,
} from "@/services/repositories/triage";
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

describe("triage repo", () => {
  it("creates then updates status for a listing", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await upsertTriageStatus(up.listing_id, "Interested");
    let t = await fetchTriage(up.listing_id);
    expect(t?.status).toBe("Interested");
    await upsertTriageStatus(up.listing_id, "Viewing");
    t = await fetchTriage(up.listing_id);
    expect(t?.status).toBe("Viewing");
  });

  it("rejects invalid status", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await expect(upsertTriageStatus(up.listing_id, "bogus")).rejects.toThrow();
  });

  it("updates note independently of status", async () => {
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    await upsertTriageNote(up.listing_id, "landlord emailed 2026-04-17");
    const t = await fetchTriage(up.listing_id);
    expect(t?.note).toBe("landlord emailed 2026-04-17");
    expect(t?.status).toBe("New");
  });
});
```

- [ ] **Step 2: Implement**

Create `src/services/repositories/triage.ts`:

```ts
import { getServerClient } from "@/services/supabase";

const ALLOWED_STATUSES = [
  "New",
  "Interested",
  "Contacted",
  "Viewing",
  "Rejected",
  "Archived",
] as const;
export type TriageStatus = (typeof ALLOWED_STATUSES)[number];

export async function upsertTriageStatus(
  listingId: string,
  status: string,
): Promise<void> {
  if (!ALLOWED_STATUSES.includes(status as TriageStatus))
    throw new Error(`invalid status: ${status}`);
  const supabase = getServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("triage_actions")
    .upsert(
      { listing_id: listingId, status, updated_at: now },
      { onConflict: "listing_id" },
    );
  if (error) throw new Error(error.message);
}

export async function upsertTriageNote(
  listingId: string,
  note: string,
): Promise<void> {
  const supabase = getServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("triage_actions")
    .upsert(
      { listing_id: listingId, note, updated_at: now },
      { onConflict: "listing_id" },
    );
  if (error) throw new Error(error.message);
}

export async function fetchTriage(
  listingId: string,
): Promise<{ status: string; note: string | null } | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("triage_actions")
    .select("status, note")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
```

- [ ] **Step 3: Tests pass**

Run: `pnpm test tests/integration/triage_repo.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/services/repositories/triage.ts tests/integration/triage_repo.test.ts
git commit -m "feat: triage_actions upsert for status and note"
```

---

## Task 10: Status + note API routes

**Files:**
- Create: `src/app/api/triage/status/route.ts`, `src/app/api/triage/note/route.ts`
- Test: `tests/integration/triage_routes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/triage_routes.test.ts`:

```ts
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
    const res = await statusPOST(req({ listing_id: "x", status: "Interested" }));
    expect(res.status).toBe(401);
  });

  it("403 on bad origin", async () => {
    const res = await statusPOST(
      req(
        { listing_id: "x", status: "Interested" },
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
```

- [ ] **Step 2: Implement status route**

Create `src/app/api/triage/status/route.ts`:

```ts
import { z } from "zod";
import { assertSameOrigin } from "@/services/auth/origin";
import { verifySession, SESSION_COOKIE_NAME } from "@/services/auth/cookie";
import { upsertTriageStatus } from "@/services/repositories/triage";

const Body = z.object({
  listing_id: z.string().uuid(),
  status: z.enum(["New", "Interested", "Contacted", "Viewing", "Rejected", "Archived"]),
});

function sessionFrom(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? match.slice(SESSION_COOKIE_NAME.length + 1) : null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }
  const token = sessionFrom(req);
  if (!token || !(await verifySession(token))) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  await upsertTriageStatus(parsed.data.listing_id, parsed.data.status);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 3: Implement note route**

Create `src/app/api/triage/note/route.ts`:

```ts
import { z } from "zod";
import { assertSameOrigin } from "@/services/auth/origin";
import { verifySession, SESSION_COOKIE_NAME } from "@/services/auth/cookie";
import { upsertTriageNote } from "@/services/repositories/triage";

const Body = z.object({
  listing_id: z.string().uuid(),
  note: z.string().max(2000),
});

function sessionFrom(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const match = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? match.slice(SESSION_COOKIE_NAME.length + 1) : null;
}

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response(null, { status: 403 });
  }
  const token = sessionFrom(req);
  if (!token || !(await verifySession(token))) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });

  await upsertTriageNote(parsed.data.listing_id, parsed.data.note);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/integration/triage_routes.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/triage/status/route.ts src/app/api/triage/note/route.ts tests/integration/triage_routes.test.ts
git commit -m "feat: POST routes for triage status + note with session and origin checks"
```

---

## Task 11: Minimal Tailwind setup

**Files:**
- Create: `postcss.config.mjs`, `tailwind.config.ts`, `src/app/globals.css`
- Modify: `src/app/layout.tsx` to import globals.css

- [ ] **Step 1: Install**

```bash
pnpm add -D tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p
```

- [ ] **Step 2: tailwind.config.ts**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

- [ ] **Step 3: globals.css**

Create `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Update `src/app/layout.tsx` to add `import "./globals.css";` at the top.

- [ ] **Step 4: Verify**

Run: `pnpm dev`. Add a quick utility class (`className="text-lg"`) to `page.tsx` to confirm styling works.

- [ ] **Step 5: Commit**

```bash
git add postcss.config.mjs tailwind.config.ts src/app/globals.css src/app/layout.tsx
git commit -m "chore: add tailwind for minimal triage UI styling"
```

---

## Task 12: Login page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Implement**

Create `src/app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 429) setError("Too many attempts. Try again later.");
      else if (!res.ok) setError("Wrong password.");
      else router.push("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="text-xl font-semibold mb-4">House Search Triage</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          className="rounded border px-3 py-2"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "Checking…" : "Log in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Manual test**

Run: `pnpm dev`. Visit `/login`, submit wrong password → error. Submit correct password → redirects to `/`.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: /login page with error + throttle handling"
```

---

## Task 13: Triage layout + list page

**Files:**
- Create: `src/app/(triage)/layout.tsx`, `src/app/(triage)/page.tsx`
- Create: `src/ui/Filters.tsx`, `src/ui/ListingCard.tsx`

- [ ] **Step 1: Layout**

Create `src/app/(triage)/layout.tsx`:

```tsx
export default function TriageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="font-semibold">House Search Triage</h1>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-sm text-gray-600 hover:underline">
            Log out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Filters component**

Create `src/ui/Filters.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const STATUSES = ["New", "Interested", "Contacted", "Viewing", "Rejected", "Archived"];
const LEVELS = ["strong", "normal", "loose"];

export function Filters() {
  const params = useSearchParams();
  const pathname = usePathname();

  function hrefWith(key: string, value: string | null) {
    const p = new URLSearchParams(params.toString());
    if (value === null) p.delete(key);
    else p.set(key, value);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="mb-4 flex flex-wrap gap-4 text-sm">
      <div>
        <span className="mr-2 text-gray-500">Status:</span>
        <Link href={hrefWith("status", null)} className="mr-2 underline">
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={hrefWith("status", s)} className="mr-2 underline">
            {s}
          </Link>
        ))}
      </div>
      <div>
        <span className="mr-2 text-gray-500">Level:</span>
        <Link href={hrefWith("level", null)} className="mr-2 underline">
          All
        </Link>
        {LEVELS.map((l) => (
          <Link key={l} href={hrefWith("level", l)} className="mr-2 underline">
            {l}
          </Link>
        ))}
      </div>
      <div>
        <span className="mr-2 text-gray-500">Sort:</span>
        <Link href={hrefWith("sort", "notified")} className="mr-2 underline">
          Notified
        </Link>
        <Link href={hrefWith("sort", "seen")} className="mr-2 underline">
          Seen
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Card component**

Create `src/ui/ListingCard.tsx`:

```tsx
import Link from "next/link";
import type { CandidateListRow } from "@/services/repositories/views";

export function ListingCard({ row }: { row: CandidateListRow }) {
  return (
    <Link
      href={`/listings/${row.listing_id}`}
      className="block rounded border bg-white p-4 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{row.title}</div>
          <div className="text-sm text-gray-600">
            {row.district} · {row.layout} · TWD {row.rent_price.toLocaleString()}/mo
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">{row.score_level ?? "?"}</div>
          <div className="text-gray-500">{row.triage_status}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        photo: {row.photo_review ?? "?"} · appliance: {row.appliance_review ?? "?"} ·
        notified: {row.last_notified_at ? new Date(row.last_notified_at).toLocaleString() : "—"}
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: List page**

Create `src/app/(triage)/page.tsx`:

```tsx
import { fetchCandidateList } from "@/services/repositories/views";
import { Filters } from "@/ui/Filters";
import { ListingCard } from "@/ui/ListingCard";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; level?: string; district?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const rows = await fetchCandidateList({
    status: params.status,
    scoreLevel: params.level,
    district: params.district,
    sort: (params.sort as "notified" | "seen" | undefined) ?? "notified",
  });

  return (
    <div>
      <Filters />
      {rows.length === 0 ? (
        <p className="text-gray-500">No candidates yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <ListingCard key={r.listing_id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Manual browser test**

Run: `pnpm dev`. Log in. Ensure seeded Supabase data has at least one notified listing (use the Plan 1 smoke script). Visit `/` — expect at least one card.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(triage\)/layout.tsx src/app/\(triage\)/page.tsx src/ui/Filters.tsx src/ui/ListingCard.tsx
git commit -m "feat: triage layout + list page with filters and sort"
```

---

## Task 14: Detail page with status + note editors

**Files:**
- Create: `src/app/(triage)/listings/[id]/page.tsx`
- Create: `src/ui/StatusPicker.tsx`, `src/ui/NoteEditor.tsx`

- [ ] **Step 1: StatusPicker component**

Create `src/ui/StatusPicker.tsx`:

```tsx
"use client";
import { useState } from "react";

const STATUSES = ["New", "Interested", "Contacted", "Viewing", "Rejected", "Archived"];

export function StatusPicker({
  listingId,
  current,
}: {
  listingId: string;
  current: string;
}) {
  const [status, setStatus] = useState(current);
  const [busy, setBusy] = useState(false);

  async function update(next: string) {
    setBusy(true);
    const prev = status;
    setStatus(next);
    const res = await fetch("/api/triage/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listing_id: listingId, status: next }),
    });
    if (!res.ok) setStatus(prev);
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map((s) => (
        <button
          key={s}
          disabled={busy}
          onClick={() => update(s)}
          className={`rounded border px-3 py-1 text-sm ${s === status ? "bg-black text-white" : "bg-white"}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: NoteEditor component**

Create `src/ui/NoteEditor.tsx`:

```tsx
"use client";
import { useState } from "react";

export function NoteEditor({
  listingId,
  current,
}: {
  listingId: string;
  current: string | null;
}) {
  const [note, setNote] = useState(current ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await fetch("/api/triage/note", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listing_id: listingId, note }),
    });
    if (res.ok) setSaved(true);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-[100px] rounded border px-3 py-2 text-sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save note"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Detail page**

Create `src/app/(triage)/listings/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { fetchCandidateDetail } from "@/services/repositories/views";
import { StatusPicker } from "@/ui/StatusPicker";
import { NoteEditor } from "@/ui/NoteEditor";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchCandidateDetail(id);
  if (!detail) notFound();

  const { listing, reviews, notifications, changes, triage } = detail;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href={listing.source_url} className="text-sm text-blue-600 underline" target="_blank" rel="noopener noreferrer">
          Open 591 listing ↗
        </a>
        <h2 className="mt-1 text-xl font-semibold">{listing.title}</h2>
        <p className="text-sm text-gray-600">
          {listing.district} · {listing.layout} · TWD {listing.rent_price.toLocaleString()} ·{" "}
          {listing.area_ping ?? "?"} ping · {listing.floor ?? "?"}
        </p>
        <p className="mt-1 text-sm text-gray-500">{listing.address_summary}</p>
      </div>

      <section>
        <h3 className="mb-2 font-medium">Triage</h3>
        <StatusPicker listingId={listing.id} current={triage.status} />
        <div className="mt-3">
          <NoteEditor listingId={listing.id} current={triage.note} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Reviews</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {reviews.map((r) => (
            <li key={r.id} className="rounded border bg-white p-3">
              <div className="text-gray-500">{new Date(r.reviewed_at).toLocaleString()}</div>
              <div>
                <b>{r.score_level}</b> · photo {r.photo_review} · appliance {r.appliance_review}
              </div>
              <div>Seen: {r.appliances_seen.join(", ") || "—"}</div>
              <div>Unknown: {r.appliances_missing_or_unknown.join(", ") || "—"}</div>
              <div>Reason: {r.recommendation_reason}</div>
              {r.concerns.length > 0 && <div>Concerns: {r.concerns.join("; ")}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Notifications</h3>
        <ul className="text-sm">
          {notifications.map((n) => (
            <li key={n.id}>
              {new Date(n.created_at).toLocaleString()} · {n.event_type} ·{" "}
              <span className={n.status === "sent" ? "text-green-700" : "text-red-600"}>
                {n.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Changes</h3>
        <ul className="text-sm">
          {changes.map((c) => (
            <li key={c.id}>
              {new Date(c.created_at).toLocaleString()} · {c.change_type} — {c.change_summary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Manual browser test**

Run: `pnpm dev`. Click a listing card → detail page loads. Click a status pill → updates optimistically; verify Supabase has the row. Edit note + save → Supabase has the note.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(triage\)/listings/\[id\]/page.tsx src/ui/StatusPicker.tsx src/ui/NoteEditor.tsx
git commit -m "feat: listing detail page with status picker and note editor"
```

---

## Task 15: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/triage.spec.ts`

- [ ] **Step 1: Install**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Config**

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Spec**

Create `tests/e2e/triage.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("login + list + detail flow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.fill('input[type="password"]', process.env.TRIAGE_PASSWORD ?? "");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL("/");

  // Assumes at least one notified listing exists (seed via Plan 1 smoke script).
  const firstCard = page.locator("a:has-text('TWD')").first();
  await firstCard.waitFor({ timeout: 10_000 });
  await firstCard.click();
  await expect(page.locator("text=Triage")).toBeVisible();
});
```

- [ ] **Step 4: Run**

Ensure `.env.local` has `TRIAGE_PASSWORD` set. Seed a listing first (`pnpm tsx scripts/smoke_end_to_end.ts`). Then:
```bash
pnpm exec playwright test
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/triage.spec.ts package.json pnpm-lock.yaml
git commit -m "test: playwright smoke for login + list + detail flow"
```

---

## Task 16: Apply login_attempts migration to prod + deploy

**Files:** none (ops)

- [ ] **Step 1: Apply prod migration**

```bash
supabase link --project-ref <prod-ref>
supabase db push
supabase link --project-ref <dev-ref>
```

- [ ] **Step 2: Set Vercel env vars**

In Vercel production env:
- `TRIAGE_PASSWORD` = strong, memorable password
- `SESSION_SIGNING_SECRET` = `openssl rand -hex 32` value
- `NEXT_PUBLIC_SITE_URL` = final production URL

- [ ] **Step 3: Merge + deploy**

```bash
git push -u origin feat/plan-2-triage
gh pr create --title "Plan 2: triage site" --body "docs/superpowers/plans/2026-04-16-plan-2-triage-site.md"
gh pr merge --squash
```

- [ ] **Step 4: Production smoke**

Visit the production URL. Expect redirect to `/login`. Enter password → lands on `/`. With at least one seeded notified listing, card appears. Click card → detail page. Update status → Supabase row updates (verify in Studio).

- [ ] **Step 5: 429 verification**

From a terminal (simulates wrong-password flood):
```bash
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<vercel-url>/api/auth/login \
    -H "content-type: application/json" \
    -H "origin: https://<vercel-url>" \
    -d '{"password":"wrong"}'
done
```
Expected: the last attempt returns 429.

---

## Self-Review Checklist

- [ ] **Spec coverage:**
  - `/login`, `/`, `/listings/[id]` — Tasks 12, 13, 14.
  - Login throttle (10 in 15 min) — Tasks 4 + 6.
  - Signed HttpOnly Secure SameSite=Lax cookie, 7-day TTL — Task 3.
  - Origin check on state-changing routes — Tasks 5, 6, 10.
  - Triage list shows only notified listings — Task 8's filter.
  - Status + note updates — Tasks 9, 10, 14.
  - Service-role key never reaches browser — all Supabase calls are in server files under `src/services/`.
- [ ] **Placeholder scan:** none.
- [ ] **Type consistency:** `CandidateListRow`, `CandidateDetail`, `TriageStatus` are consistent.
- [ ] **Security:**
  - Cookie is `HttpOnly; Secure; SameSite=Lax`.
  - Every state-changing route calls `assertSameOrigin` and checks session.
  - MCP endpoint rejects session cookies (Plan 1); session routes don't accept bearer tokens.

## Acceptance Criteria for Plan 2

Plan 2 is complete when:

- Production URL redirects unauth'd visitors to `/login`.
- Correct password returns to `/`, which shows notified listings.
- Filters and sort behave as specified.
- `/listings/[id]` shows listing, reviews, notifications, changes, and allows editing status + note (both round-tripped to Supabase).
- Wrong-password flood produces 429 after 10 attempts in 15 min.
- Playwright smoke test passes against production or local dev.

---

## Out-of-scope reminders

- Runbook skill, trigger setup, GitHub connection on runner account → **Plan 3**.
- Real authentication (multi-user) → future upgrade, not v1.
