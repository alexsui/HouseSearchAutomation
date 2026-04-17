# Backend (Supabase + MCP + LINE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the Vercel-hosted MCP server, Supabase schema, and LINE notification pipeline that the hourly Claude Code remote trigger will call to persist candidate listings and send LINE push messages.

**Architecture:** Single Next.js 15 App Router project on Vercel. One route (`/api/mcp/route.ts`) hosts a Streamable-HTTP MCP server exposing three tools backed by Supabase (service-role key, server-only) and the LINE Messaging API. All candidate validation, change detection, and dedupe logic lives server-side in plain TypeScript modules; the MCP tool handlers are thin orchestrators over those modules, which makes them directly testable without spinning up the HTTP transport.

**Tech Stack:** Next.js 15, TypeScript (strict), pnpm, `mcp-handler` (v1.x) + `@modelcontextprotocol/sdk`, Supabase JS client (`@supabase/supabase-js`) with service-role key, Zod for runtime validation, Vitest for tests, Supabase CLI for migrations.

**Branch:** `feat/plan-1-backend`.

---

## Prerequisites (manual, one-time, before Task 1)

Complete these before starting — they unblock later tasks and cannot be automated.

1. **LINE bot setup** — Create a LINE Official Account and Messaging API channel at https://developers.line.biz. Record:
   - `LINE_CHANNEL_ACCESS_TOKEN` (long-lived access token from the channel console).
   - `LINE_USER_ID` — the user ID that will receive pushes. Add the Official Account as a friend, then use LINE's `/v2/bot/followers/ids` endpoint or a temporary webhook to capture your own user ID.
2. **Supabase projects** — Create two free-tier projects at https://supabase.com:
   - `house-search-dev` (for local development + integration tests).
   - `house-search-prod` (for the real deployment).
   For each, copy the `Project URL` and `service_role` key from *Settings → API*.
3. **Vercel project** — Create a new Vercel project linked to `https://github.com/alexsui/HouseSearchAutomation`. Leave env vars empty for now (Task 22 sets them).
4. **Supabase CLI** — Install per https://supabase.com/docs/guides/cli. Verify: `supabase --version`.
5. **pnpm** — Install: `npm install -g pnpm`. Verify: `pnpm --version`.
6. **Generate AUTOMATION_SECRET** — Run `openssl rand -hex 32` and save the output somewhere safe. It will be the MCP bearer token.

Record all secrets in a password manager. They will be typed into `.env.local` (dev) and Vercel dashboard (prod). Nothing goes into the repo.

## File Structure

```
house-search/
├── .env.local.example              # template; committed
├── .env.local                      # dev secrets; gitignored
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── supabase/
│   └── migrations/
│       ├── 20260416000000_init.sql
│       └── 20260416000001_indexes.sql
├── src/
│   ├── config/
│   │   └── env.ts                  # reads + validates required env vars
│   ├── domain/
│   │   ├── types.ts                # shared TS types (Candidate, Listing, etc.)
│   │   ├── schema.ts               # Zod schemas for candidate JSON
│   │   ├── canonical.ts            # canonical_json utility
│   │   ├── event_hash.ts           # sha256 event_hash per spec rules
│   │   ├── change_detection.ts     # diff prior snapshot + review → change_type + payload
│   │   └── message.ts              # LINE message body renderer
│   ├── services/
│   │   ├── supabase.ts             # server-side Supabase client factory
│   │   ├── line.ts                 # LINE Messaging API push client
│   │   └── repositories/
│   │       ├── listings.ts         # upsert listing, fetch recent, fetch prior snapshot
│   │       ├── reviews.ts          # insert review, fetch latest review
│   │       ├── changes.ts          # insert change rows
│   │       └── notifications.ts    # check dedupe, insert notification outcome
│   ├── mcp/
│   │   └── handlers/
│   │       ├── upsert_listing.ts         # pure orchestration fn
│   │       ├── get_known_listings.ts     # pure orchestration fn
│   │       └── send_line_notification.ts # pure orchestration fn
│   └── app/
│       └── api/
│           └── mcp/
│               └── route.ts        # mcp-handler route with bearer auth
├── tests/
│   ├── unit/
│   │   ├── canonical.test.ts
│   │   ├── event_hash.test.ts
│   │   ├── change_detection.test.ts
│   │   ├── message.test.ts
│   │   └── schema.test.ts
│   ├── integration/
│   │   ├── listings_repo.test.ts
│   │   ├── notifications_repo.test.ts
│   │   ├── upsert_listing.test.ts
│   │   ├── get_known_listings.test.ts
│   │   ├── send_line_notification.test.ts
│   │   └── mcp_route.test.ts
│   └── fixtures/
│       ├── candidates.ts
│       └── line_mock.ts
└── docs/
    └── superpowers/
        ├── specs/2026-04-16-house-search-automation-design.md
        └── plans/2026-04-16-plan-1-backend.md
```

Each file has one responsibility. Repositories do DB I/O only; domain modules are pure; MCP handlers compose domain + repos and return the MCP-tool-shaped result.

---

## Task 1: Scaffold Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.local.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx` (minimal placeholder; real UI is Plan 2)

- [ ] **Step 1: Confirm working directory and remote**

Run: `git remote -v`
Expected: shows `origin  https://github.com/alexsui/HouseSearchAutomation (fetch)` (and push).

- [ ] **Step 2: Create branch**

Run: `git checkout -b feat/plan-1-backend`
Expected: `Switched to a new branch 'feat/plan-1-backend'`.

- [ ] **Step 3: Write package.json**

Create `package.json`:

```json
{
  "name": "house-search",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Install runtime dependencies**

Run:
```bash
pnpm add next@^15 react@^19 react-dom@^19 zod@^3 @supabase/supabase-js@^2 mcp-handler@^1 @modelcontextprotocol/sdk
```

Expected: `pnpm-lock.yaml` created, no errors.

- [ ] **Step 5: Install dev dependencies**

Run:
```bash
pnpm add -D typescript@^5 @types/node @types/react @types/react-dom vitest@^2 @vitest/ui tsx
```

- [ ] **Step 6: Write tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", "tests/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7: Write next.config.ts**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {},
};

export default config;
```

- [ ] **Step 8: Write .gitignore**

Create `.gitignore`:

```
node_modules/
.next/
.env.local
.env*.local
*.tsbuildinfo
.vercel/
```

- [ ] **Step 9: Write .env.local.example**

Create `.env.local.example`:

```bash
# Supabase (dev project)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=
LINE_USER_ID=

# MCP bearer token (openssl rand -hex 32)
AUTOMATION_SECRET=

# Triage site (Plan 2 uses these; present for completeness)
TRIAGE_PASSWORD=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 10: Copy to .env.local and fill dev values**

Run:
```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with the dev Supabase URL + service-role key, LINE tokens, and the `AUTOMATION_SECRET` from the prerequisites step. Leave `TRIAGE_PASSWORD` blank for now.

- [ ] **Step 11: Minimal App Router placeholder**

Create `src/app/layout.tsx`:

```tsx
export const metadata = { title: "House Search" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function Home() {
  return <main>House Search backend running.</main>;
}
```

- [ ] **Step 12: Verify dev server starts**

Run: `pnpm dev`
Expected: Next starts on `http://localhost:3000`. Ctrl+C to stop.

- [ ] **Step 13: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts .gitignore .env.local.example src/app/layout.tsx src/app/page.tsx
git commit -m "chore: scaffold Next.js 15 + pnpm project"
```

---

## Task 2: Vitest configuration

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write vitest.config.ts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Write smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/unit/smoke.test.ts
git commit -m "chore: add vitest with smoke test"
```

---

## Task 3: Env var loader

**Files:**
- Create: `src/config/env.ts`
- Test: `tests/unit/env.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/env.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadServerEnv } from "@/config/env";

describe("loadServerEnv", () => {
  const base = {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    LINE_CHANNEL_ACCESS_TOKEN: "t",
    LINE_USER_ID: "U123",
    AUTOMATION_SECRET: "s",
  };

  beforeEach(() => {
    for (const k of Object.keys(base)) delete process.env[k];
  });

  it("returns parsed config when all vars present", () => {
    Object.assign(process.env, base);
    const env = loadServerEnv();
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
    expect(env.AUTOMATION_SECRET).toBe("s");
  });

  it("throws with list of missing vars", () => {
    expect(() => loadServerEnv()).toThrowError(/AUTOMATION_SECRET/);
  });
});
```

- [ ] **Step 2: Run, confirm it fails**

Run: `pnpm test tests/unit/env.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/config/env.ts`:

```ts
import { z } from "zod";

const ServerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_USER_ID: z.string().min(1),
  AUTOMATION_SECRET: z.string().min(16),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadServerEnv(): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server env vars: ${missing}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/unit/env.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts tests/unit/env.test.ts
git commit -m "feat: add server env var loader with zod validation"
```

---

## Task 4: Domain types + candidate Zod schema

**Files:**
- Create: `src/domain/types.ts`, `src/domain/schema.ts`
- Test: `tests/unit/schema.test.ts`
- Create: `tests/fixtures/candidates.ts`

- [ ] **Step 1: Write fixtures**

Create `tests/fixtures/candidates.ts`:

```ts
import type { Candidate } from "@/domain/types";

export const validCandidate: Candidate = {
  listing_identity: {
    source: "591",
    source_listing_id: "abc123",
    source_url: "https://rent.591.com.tw/home/abc123",
  },
  title: "Shilin 2BR Near MRT",
  rent_price: 25000,
  district: "Shilin",
  address_summary: "Shilin District, Near Zhishan MRT",
  layout: "2房1廳1衛",
  area_ping: 18,
  floor: "4F/5F",
  score_level: "strong",
  photo_review: "acceptable",
  appliance_review: "partial",
  appliances_seen: ["air_conditioner", "refrigerator"],
  appliances_missing_or_unknown: ["washing_machine", "water_heater"],
  recommendation_reason: "price in range, clean photos",
  concerns: ["bathroom photos dark"],
  change_type: "new_listing",
  should_notify: true,
};
```

- [ ] **Step 2: Write failing tests**

Create `tests/unit/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CandidateSchema } from "@/domain/schema";
import { validCandidate } from "../fixtures/candidates";

describe("CandidateSchema", () => {
  it("accepts a valid candidate", () => {
    expect(() => CandidateSchema.parse(validCandidate)).not.toThrow();
  });

  it("rejects missing source_listing_id", () => {
    const bad = {
      ...validCandidate,
      listing_identity: { ...validCandidate.listing_identity, source_listing_id: "" },
    };
    expect(() => CandidateSchema.parse(bad)).toThrow();
  });

  it("rejects out-of-range score_level", () => {
    const bad = { ...validCandidate, score_level: "maybe" };
    expect(() => CandidateSchema.parse(bad)).toThrow();
  });

  it("rejects rent_price over 30000", () => {
    const bad = { ...validCandidate, rent_price: 31000 };
    expect(() => CandidateSchema.parse(bad)).toThrow();
  });

  it("allows area_ping and floor to be null", () => {
    const ok = { ...validCandidate, area_ping: null, floor: null };
    expect(() => CandidateSchema.parse(ok)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run, confirm fails**

Run: `pnpm test tests/unit/schema.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 4: Implement types**

Create `src/domain/types.ts`:

```ts
export type ScoreLevel = "strong" | "normal" | "loose" | "reject";
export type PhotoReview = "acceptable" | "needs_review" | "poor";
export type ApplianceReview = "complete" | "partial" | "missing";
export type ChangeType =
  | "new_listing"
  | "price_drop"
  | "relisted"
  | "became_candidate"
  | "material_listing_change"
  | "review_change"
  | "none";

export const REQUIRED_APPLIANCES = [
  "air_conditioner",
  "refrigerator",
  "washing_machine",
  "water_heater",
] as const;
export type Appliance = (typeof REQUIRED_APPLIANCES)[number];

export interface ListingIdentity {
  source: "591";
  source_listing_id: string;
  source_url: string;
}

export interface Candidate {
  listing_identity: ListingIdentity;
  title: string;
  rent_price: number;
  district: string;
  address_summary: string;
  layout: string;
  area_ping: number | null;
  floor: string | null;
  score_level: ScoreLevel;
  photo_review: PhotoReview;
  appliance_review: ApplianceReview;
  appliances_seen: Appliance[];
  appliances_missing_or_unknown: Appliance[];
  recommendation_reason: string;
  concerns: string[];
  change_type: ChangeType;
  should_notify: boolean;
}
```

- [ ] **Step 5: Implement schema**

Create `src/domain/schema.ts`:

```ts
import { z } from "zod";
import { REQUIRED_APPLIANCES } from "./types";

const ApplianceEnum = z.enum(REQUIRED_APPLIANCES);

export const ListingIdentitySchema = z.object({
  source: z.literal("591"),
  source_listing_id: z.string().min(1),
  source_url: z.string().url(),
});

export const CandidateSchema = z.object({
  listing_identity: ListingIdentitySchema,
  title: z.string().min(1),
  rent_price: z.number().int().positive().max(30000),
  district: z.string().min(1),
  address_summary: z.string(),
  layout: z.string().min(1),
  area_ping: z.number().positive().nullable(),
  floor: z.string().nullable(),
  score_level: z.enum(["strong", "normal", "loose", "reject"]),
  photo_review: z.enum(["acceptable", "needs_review", "poor"]),
  appliance_review: z.enum(["complete", "partial", "missing"]),
  appliances_seen: z.array(ApplianceEnum),
  appliances_missing_or_unknown: z.array(ApplianceEnum),
  recommendation_reason: z.string(),
  concerns: z.array(z.string()),
  change_type: z.enum([
    "new_listing",
    "price_drop",
    "relisted",
    "became_candidate",
    "material_listing_change",
    "review_change",
    "none",
  ]),
  should_notify: z.boolean(),
});

export type CandidateInput = z.input<typeof CandidateSchema>;
```

- [ ] **Step 6: Run tests, verify all pass**

Run: `pnpm test tests/unit/schema.test.ts`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/schema.ts tests/unit/schema.test.ts tests/fixtures/candidates.ts
git commit -m "feat: add candidate JSON types and zod schema"
```

---

## Task 5: Canonical JSON utility

**Files:**
- Create: `src/domain/canonical.ts`
- Test: `tests/unit/canonical.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/canonical.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canonicalJson } from "@/domain/canonical";

describe("canonicalJson", () => {
  it("sorts object keys deterministically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("removes keys whose value is null", () => {
    expect(canonicalJson({ a: 1, b: null })).toBe('{"a":1}');
  });

  it("trims strings and collapses whitespace", () => {
    expect(canonicalJson({ s: "  hello   world  " })).toBe('{"s":"hello world"}');
  });

  it("coerces integer-valued numbers to integers", () => {
    expect(canonicalJson({ price: 25000.0 })).toBe('{"price":25000}');
  });

  it("handles nested objects and arrays", () => {
    const out = canonicalJson({
      payload: { b: 2, a: 1, arr: [{ y: 2, x: 1 }] },
    });
    expect(out).toBe('{"payload":{"a":1,"arr":[{"x":1,"y":2}],"b":2}}');
  });

  it("is stable across equivalent inputs", () => {
    const a = { x: "  foo ", y: null, z: 3 };
    const b = { z: 3.0, x: "foo", y: null };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/unit/canonical.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/domain/canonical.ts`:

```ts
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value;
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(normalize).filter((v) => v !== undefined);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, normalize(v)] as const)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  }
  return undefined;
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/unit/canonical.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/canonical.ts tests/unit/canonical.test.ts
git commit -m "feat: add canonicalJson for stable event_hash input"
```

---

## Task 6: Event hash computation

**Files:**
- Create: `src/domain/event_hash.ts`
- Test: `tests/unit/event_hash.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/event_hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeEventHash } from "@/domain/event_hash";

describe("computeEventHash", () => {
  it("produces a 64-char hex sha256", () => {
    const hash = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "abc",
      payload: { rent_price: 25000 },
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across runs", () => {
    const input = {
      event_type: "price_drop" as const,
      source: "591" as const,
      source_listing_id: "xyz",
      payload: { previous_rent_price: 28000, current_rent_price: 25000 },
    };
    expect(computeEventHash(input)).toBe(computeEventHash(input));
  });

  it("is stable under equivalent payloads", () => {
    const a = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { b: 1, a: 2, n: null },
    });
    const b = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { a: 2, b: 1 },
    });
    expect(a).toBe(b);
  });

  it("changes when payload changes", () => {
    const a = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { rent_price: 25000 },
    });
    const b = computeEventHash({
      event_type: "new_listing",
      source: "591",
      source_listing_id: "a",
      payload: { rent_price: 24000 },
    });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/unit/event_hash.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/domain/event_hash.ts`:

```ts
import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical";
import type { ChangeType } from "./types";

export type EventType = Exclude<ChangeType, "none">;

export interface EventHashInput {
  event_type: EventType;
  source: "591";
  source_listing_id: string;
  payload: Record<string, unknown>;
}

export function computeEventHash(input: EventHashInput): string {
  const canonical = canonicalJson({
    event_type: input.event_type,
    source: input.source,
    source_listing_id: input.source_listing_id,
    payload: input.payload,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/unit/event_hash.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/event_hash.ts tests/unit/event_hash.test.ts
git commit -m "feat: compute deterministic sha256 event_hash"
```

---

## Task 7: Supabase migrations (init schema)

**Files:**
- Create: `supabase/migrations/20260416000000_init.sql`
- Create: `supabase/migrations/20260416000001_indexes.sql`

- [ ] **Step 1: Write init migration**

Create `supabase/migrations/20260416000000_init.sql`:

```sql
create extension if not exists "uuid-ossp";

create table listings (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  source_listing_id text not null,
  source_url text not null,
  title text not null,
  rent_price integer not null,
  district text not null,
  address_summary text not null,
  layout text not null,
  area_ping numeric,
  floor text,
  raw_snapshot jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  current_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_listing_id)
);

create table listing_reviews (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  run_id text not null,
  score_level text not null,
  photo_review text not null,
  appliance_review text not null,
  appliances_seen text[] not null default '{}',
  appliances_missing_or_unknown text[] not null default '{}',
  recommendation_reason text not null,
  concerns text[] not null default '{}',
  reviewed_at timestamptz not null default now()
);

create table listing_changes (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  run_id text not null,
  change_type text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  change_summary text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade,
  event_type text not null,
  event_hash text not null,
  channel text not null default 'line',
  message_body text not null,
  status text not null,
  provider_response jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, event_type, event_hash)
);

create table triage_actions (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references listings(id) on delete cascade unique,
  status text not null default 'New',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- triage status check
alter table triage_actions
  add constraint triage_actions_status_check
  check (status in ('New','Interested','Contacted','Viewing','Rejected','Archived'));
```

- [ ] **Step 2: Write indexes migration**

Create `supabase/migrations/20260416000001_indexes.sql`:

```sql
create index listings_last_seen_at_idx on listings (last_seen_at desc);
create index listings_district_idx on listings (district);
create index listing_reviews_listing_id_reviewed_at_idx
  on listing_reviews (listing_id, reviewed_at desc);
create index listing_changes_listing_id_created_at_idx
  on listing_changes (listing_id, created_at desc);
create index notifications_listing_id_sent_at_idx
  on notifications (listing_id, sent_at desc);
create index notifications_status_idx on notifications (status);
```

- [ ] **Step 3: Link local Supabase project**

Run in project root:
```bash
supabase link --project-ref <your-dev-project-ref>
```

You will be prompted for the Supabase access token (`supabase login` first if needed).

- [ ] **Step 4: Apply migrations to dev project**

Run:
```bash
supabase db push
```

Expected: applies both migration files. Verify in Supabase Studio → Table Editor.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add supabase schema migrations"
```

---

## Task 8: Supabase server client

**Files:**
- Create: `src/services/supabase.ts`
- Test: `tests/integration/listings_repo.test.ts` (minimal smoke test here; fuller tests in Task 9)

- [ ] **Step 1: Implement**

Create `src/services/supabase.ts`:

```ts
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
```

- [ ] **Step 2: Write smoke integration test**

Create `tests/integration/listings_repo.test.ts`:

```ts
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
```

- [ ] **Step 3: Install dotenv for tests**

Run: `pnpm add -D dotenv`

- [ ] **Step 4: Run test**

Run: `pnpm test tests/integration/listings_repo.test.ts`
Expected: 1 passed. If env not loaded, fix `.env.local` path.

- [ ] **Step 5: Commit**

```bash
git add src/services/supabase.ts tests/integration/listings_repo.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add supabase server client factory"
```

---

## Task 9: Listings + reviews repositories

**Files:**
- Create: `src/services/repositories/listings.ts`
- Create: `src/services/repositories/reviews.ts`
- Extend: `tests/integration/listings_repo.test.ts`

- [ ] **Step 1: Write tests first**

Replace `tests/integration/listings_repo.test.ts` with:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import {
  upsertListing,
  findListingByIdentity,
  type ListingRow,
} from "@/services/repositories/listings";
import { insertReview } from "@/services/repositories/reviews";
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

describe("listings repo", () => {
  it("upserts a new listing and returns the row", async () => {
    const row = await upsertListing(validCandidate);
    expect(row.source_listing_id).toBe("abc123");
    expect(row.rent_price).toBe(25000);
    expect(row.first_seen_at).toBeDefined();
  });

  it("updates existing listing on repeat upsert and keeps first_seen_at", async () => {
    const first = await upsertListing(validCandidate);
    const second = await upsertListing({ ...validCandidate, rent_price: 24000 });
    expect(second.id).toBe(first.id);
    expect(second.rent_price).toBe(24000);
    expect(second.first_seen_at).toBe(first.first_seen_at);
  });

  it("finds a listing by identity", async () => {
    await upsertListing(validCandidate);
    const row = await findListingByIdentity("591", "abc123");
    expect(row?.source_listing_id).toBe("abc123");
  });
});

describe("reviews repo", () => {
  it("inserts a review for an existing listing", async () => {
    const listing = await upsertListing(validCandidate);
    const review = await insertReview({
      listing_id: listing.id,
      run_id: "run-1",
      candidate: validCandidate,
    });
    expect(review.score_level).toBe("strong");
    expect(review.appliances_seen).toEqual(["air_conditioner", "refrigerator"]);
  });
});
```

- [ ] **Step 2: Implement listings repository**

Create `src/services/repositories/listings.ts`:

```ts
import { getServerClient } from "@/services/supabase";
import type { Candidate } from "@/domain/types";

export interface ListingRow {
  id: string;
  source: string;
  source_listing_id: string;
  source_url: string;
  title: string;
  rent_price: number;
  district: string;
  address_summary: string;
  layout: string;
  area_ping: number | null;
  floor: string | null;
  raw_snapshot: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  current_status: string;
  created_at: string;
  updated_at: string;
}

export async function upsertListing(candidate: Candidate): Promise<ListingRow> {
  const supabase = getServerClient();
  const id = candidate.listing_identity;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("listings")
    .upsert(
      {
        source: id.source,
        source_listing_id: id.source_listing_id,
        source_url: id.source_url,
        title: candidate.title,
        rent_price: candidate.rent_price,
        district: candidate.district,
        address_summary: candidate.address_summary,
        layout: candidate.layout,
        area_ping: candidate.area_ping,
        floor: candidate.floor,
        raw_snapshot: candidate,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "source,source_listing_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`upsertListing failed: ${error.message}`);
  return data as ListingRow;
}

export async function findListingByIdentity(
  source: string,
  sourceListingId: string,
): Promise<ListingRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("source", source)
    .eq("source_listing_id", sourceListingId)
    .maybeSingle();
  if (error) throw new Error(`findListingByIdentity failed: ${error.message}`);
  return (data as ListingRow | null) ?? null;
}
```

- [ ] **Step 3: Implement reviews repository**

Create `src/services/repositories/reviews.ts`:

```ts
import { getServerClient } from "@/services/supabase";
import type { Candidate } from "@/domain/types";

export interface ReviewRow {
  id: string;
  listing_id: string;
  run_id: string;
  score_level: string;
  photo_review: string;
  appliance_review: string;
  appliances_seen: string[];
  appliances_missing_or_unknown: string[];
  recommendation_reason: string;
  concerns: string[];
  reviewed_at: string;
}

export async function insertReview(input: {
  listing_id: string;
  run_id: string;
  candidate: Candidate;
}): Promise<ReviewRow> {
  const { listing_id, run_id, candidate } = input;
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listing_reviews")
    .insert({
      listing_id,
      run_id,
      score_level: candidate.score_level,
      photo_review: candidate.photo_review,
      appliance_review: candidate.appliance_review,
      appliances_seen: candidate.appliances_seen,
      appliances_missing_or_unknown: candidate.appliances_missing_or_unknown,
      recommendation_reason: candidate.recommendation_reason,
      concerns: candidate.concerns,
    })
    .select()
    .single();
  if (error) throw new Error(`insertReview failed: ${error.message}`);
  return data as ReviewRow;
}

export async function fetchLatestReview(listingId: string): Promise<ReviewRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listing_reviews")
    .select("*")
    .eq("listing_id", listingId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`fetchLatestReview failed: ${error.message}`);
  return (data as ReviewRow | null) ?? null;
}
```

- [ ] **Step 4: Fix first_seen_at preservation**

The default upsert overwrites `first_seen_at`. To preserve it, use a RPC or read-modify-write. Simplest fix — update the `upsertListing` function so it only sets `first_seen_at` on insert:

Replace the upsert call in `src/services/repositories/listings.ts` with:

```ts
const existing = await findListingByIdentity(id.source, id.source_listing_id);
const first_seen_at = existing?.first_seen_at ?? now;
const { data, error } = await supabase
  .from("listings")
  .upsert(
    {
      source: id.source,
      source_listing_id: id.source_listing_id,
      source_url: id.source_url,
      title: candidate.title,
      rent_price: candidate.rent_price,
      district: candidate.district,
      address_summary: candidate.address_summary,
      layout: candidate.layout,
      area_ping: candidate.area_ping,
      floor: candidate.floor,
      raw_snapshot: candidate,
      first_seen_at,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "source,source_listing_id" },
  )
  .select()
  .single();
```

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/integration/listings_repo.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/services/repositories/listings.ts src/services/repositories/reviews.ts tests/integration/listings_repo.test.ts
git commit -m "feat: listings + reviews repositories with first_seen_at preservation"
```

---

## Task 10: Changes + notifications repositories

**Files:**
- Create: `src/services/repositories/changes.ts`, `src/services/repositories/notifications.ts`
- Create: `tests/integration/notifications_repo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/notifications_repo.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { upsertListing } from "@/services/repositories/listings";
import { insertChange } from "@/services/repositories/changes";
import {
  hasPriorSentNotification,
  insertNotification,
} from "@/services/repositories/notifications";
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

describe("changes repo", () => {
  it("inserts a change row", async () => {
    const listing = await upsertListing(validCandidate);
    const change = await insertChange({
      listing_id: listing.id,
      run_id: "run-1",
      change_type: "new_listing",
      before_snapshot: null,
      after_snapshot: { rent_price: 25000 },
      change_summary: "first observation",
    });
    expect(change.change_type).toBe("new_listing");
  });
});

describe("notifications repo", () => {
  it("returns false when no prior sent notification", async () => {
    const listing = await upsertListing(validCandidate);
    const has = await hasPriorSentNotification(listing.id, "new_listing", "hash-a");
    expect(has).toBe(false);
  });

  it("returns true after a sent notification is recorded", async () => {
    const listing = await upsertListing(validCandidate);
    await insertNotification({
      listing_id: listing.id,
      event_type: "new_listing",
      event_hash: "hash-b",
      message_body: "test",
      status: "sent",
      provider_response: { ok: true },
    });
    const has = await hasPriorSentNotification(listing.id, "new_listing", "hash-b");
    expect(has).toBe(true);
  });

  it("does not count failed notifications as duplicates", async () => {
    const listing = await upsertListing(validCandidate);
    await insertNotification({
      listing_id: listing.id,
      event_type: "new_listing",
      event_hash: "hash-c",
      message_body: "test",
      status: "failed",
      provider_response: { error: "network" },
    });
    const has = await hasPriorSentNotification(listing.id, "new_listing", "hash-c");
    expect(has).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/integration/notifications_repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement changes repository**

Create `src/services/repositories/changes.ts`:

```ts
import { getServerClient } from "@/services/supabase";
import type { ChangeType } from "@/domain/types";

export interface ChangeRow {
  id: string;
  listing_id: string;
  run_id: string;
  change_type: ChangeType;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  change_summary: string;
  created_at: string;
}

export async function insertChange(input: {
  listing_id: string;
  run_id: string;
  change_type: Exclude<ChangeType, "none">;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  change_summary: string;
}): Promise<ChangeRow> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("listing_changes")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`insertChange failed: ${error.message}`);
  return data as ChangeRow;
}
```

- [ ] **Step 4: Implement notifications repository**

Create `src/services/repositories/notifications.ts`:

```ts
import { getServerClient } from "@/services/supabase";

export interface NotificationRow {
  id: string;
  listing_id: string;
  event_type: string;
  event_hash: string;
  channel: string;
  message_body: string;
  status: "sent" | "failed";
  provider_response: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
}

export async function hasPriorSentNotification(
  listingId: string,
  eventType: string,
  eventHash: string,
): Promise<boolean> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("listing_id", listingId)
    .eq("event_type", eventType)
    .eq("event_hash", eventHash)
    .eq("status", "sent")
    .limit(1);
  if (error) throw new Error(`hasPriorSentNotification failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function insertNotification(input: {
  listing_id: string;
  event_type: string;
  event_hash: string;
  message_body: string;
  status: "sent" | "failed";
  provider_response: Record<string, unknown> | null;
}): Promise<NotificationRow> {
  const supabase = getServerClient();
  const sent_at = input.status === "sent" ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("notifications")
    .insert({ ...input, channel: "line", sent_at })
    .select()
    .single();
  if (error) throw new Error(`insertNotification failed: ${error.message}`);
  return data as NotificationRow;
}
```

- [ ] **Step 5: Tests pass**

Run: `pnpm test tests/integration/notifications_repo.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/services/repositories/changes.ts src/services/repositories/notifications.ts tests/integration/notifications_repo.test.ts
git commit -m "feat: changes + notifications repositories with sent-dedupe check"
```

---

## Task 11: Change detection domain logic

**Files:**
- Create: `src/domain/change_detection.ts`
- Test: `tests/unit/change_detection.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/change_detection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectChanges } from "@/domain/change_detection";
import { validCandidate } from "../fixtures/candidates";
import type { Candidate } from "@/domain/types";

const prior = {
  rent_price: 28000,
  district: validCandidate.district,
  address_summary: validCandidate.address_summary,
  layout: validCandidate.layout,
  area_ping: validCandidate.area_ping,
  floor: validCandidate.floor,
  score_level: "normal" as const,
  photo_review: validCandidate.photo_review,
  appliance_review: validCandidate.appliance_review,
  appliances_seen: validCandidate.appliances_seen,
  appliances_missing_or_unknown: validCandidate.appliances_missing_or_unknown,
};

describe("detectChanges", () => {
  it("returns new_listing when no prior listing exists", () => {
    const out = detectChanges({ prior: null, priorReview: null, candidate: validCandidate });
    expect(out.map((c) => c.change_type)).toContain("new_listing");
  });

  it("returns price_drop when rent decreases", () => {
    const candidate = { ...validCandidate, rent_price: 24000 };
    const out = detectChanges({
      prior: { ...prior, rent_price: 28000 },
      priorReview: prior,
      candidate,
    });
    const kinds = out.map((c) => c.change_type);
    expect(kinds).toContain("price_drop");
  });

  it("returns became_candidate when prior was reject and current is not", () => {
    const candidate: Candidate = { ...validCandidate, score_level: "strong" };
    const out = detectChanges({
      prior,
      priorReview: { ...prior, score_level: "reject" },
      candidate,
    });
    expect(out.map((c) => c.change_type)).toContain("became_candidate");
  });

  it("returns material_listing_change on layout change", () => {
    const candidate = { ...validCandidate, layout: "3房2廳2衛" };
    const out = detectChanges({ prior, priorReview: prior, candidate });
    expect(out.map((c) => c.change_type)).toContain("material_listing_change");
  });

  it("returns review_change when photo_review changes", () => {
    const candidate = { ...validCandidate, photo_review: "poor" as const };
    const out = detectChanges({ prior, priorReview: prior, candidate });
    expect(out.map((c) => c.change_type)).toContain("review_change");
  });

  it("returns empty array on no meaningful change", () => {
    const out = detectChanges({
      prior: { ...prior, rent_price: validCandidate.rent_price },
      priorReview: {
        ...prior,
        rent_price: validCandidate.rent_price,
        score_level: validCandidate.score_level,
      },
      candidate: validCandidate,
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/unit/change_detection.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/domain/change_detection.ts`:

```ts
import type { Candidate, ChangeType, ScoreLevel } from "./types";

export interface PriorSnapshot {
  rent_price: number;
  district: string;
  address_summary: string;
  layout: string;
  area_ping: number | null;
  floor: string | null;
  score_level: ScoreLevel;
  photo_review: string;
  appliance_review: string;
  appliances_seen: string[];
  appliances_missing_or_unknown: string[];
}

export interface DetectedChange {
  change_type: Exclude<ChangeType, "none">;
  payload: Record<string, unknown>;
  summary: string;
}

export function detectChanges(input: {
  prior: PriorSnapshot | null;
  priorReview: PriorSnapshot | null;
  candidate: Candidate;
}): DetectedChange[] {
  const { prior, priorReview, candidate } = input;

  if (!prior) {
    return [
      {
        change_type: "new_listing",
        payload: {
          source_listing_id: candidate.listing_identity.source_listing_id,
          source_url: candidate.listing_identity.source_url,
          rent_price: candidate.rent_price,
          district: candidate.district,
          layout: candidate.layout,
          area_ping: candidate.area_ping,
          floor: candidate.floor,
          score_level: candidate.score_level,
          photo_review: candidate.photo_review,
          appliance_review: candidate.appliance_review,
        },
        summary: `new listing at TWD ${candidate.rent_price}`,
      },
    ];
  }

  const out: DetectedChange[] = [];

  if (candidate.rent_price < prior.rent_price) {
    out.push({
      change_type: "price_drop",
      payload: {
        source_listing_id: candidate.listing_identity.source_listing_id,
        previous_rent_price: prior.rent_price,
        current_rent_price: candidate.rent_price,
      },
      summary: `rent dropped from ${prior.rent_price} to ${candidate.rent_price}`,
    });
  }

  if (
    priorReview &&
    priorReview.score_level === "reject" &&
    candidate.score_level !== "reject"
  ) {
    out.push({
      change_type: "became_candidate",
      payload: {
        previous_score_level: priorReview.score_level,
        current_score_level: candidate.score_level,
        photo_review: candidate.photo_review,
        appliance_review: candidate.appliance_review,
      },
      summary: `promoted from reject to ${candidate.score_level}`,
    });
  }

  const materialChanged: Record<string, unknown> = {};
  if (candidate.rent_price !== prior.rent_price) materialChanged.rent_price = candidate.rent_price;
  if (candidate.district !== prior.district) materialChanged.district = candidate.district;
  if (candidate.address_summary !== prior.address_summary)
    materialChanged.address_summary = candidate.address_summary;
  if (candidate.layout !== prior.layout) materialChanged.layout = candidate.layout;
  if (candidate.area_ping !== prior.area_ping) materialChanged.area_ping = candidate.area_ping;
  if (candidate.floor !== prior.floor) materialChanged.floor = candidate.floor;
  if (Object.keys(materialChanged).length > 0 && !materialChanged.rent_price) {
    // price-only changes are captured by price_drop; skip if that is the only material change
    out.push({
      change_type: "material_listing_change",
      payload: materialChanged,
      summary: `material fields changed: ${Object.keys(materialChanged).join(", ")}`,
    });
  } else if (Object.keys(materialChanged).length > 1) {
    out.push({
      change_type: "material_listing_change",
      payload: materialChanged,
      summary: `material fields changed: ${Object.keys(materialChanged).join(", ")}`,
    });
  }

  if (priorReview) {
    if (
      priorReview.photo_review !== candidate.photo_review ||
      priorReview.appliance_review !== candidate.appliance_review ||
      !arraysEqual(priorReview.appliances_seen, candidate.appliances_seen) ||
      !arraysEqual(
        priorReview.appliances_missing_or_unknown,
        candidate.appliances_missing_or_unknown,
      )
    ) {
      out.push({
        change_type: "review_change",
        payload: {
          previous_photo_review: priorReview.photo_review,
          current_photo_review: candidate.photo_review,
          previous_appliance_review: priorReview.appliance_review,
          current_appliance_review: candidate.appliance_review,
          previous_appliances_seen: priorReview.appliances_seen,
          current_appliances_seen: candidate.appliances_seen,
          previous_appliances_missing_or_unknown: priorReview.appliances_missing_or_unknown,
          current_appliances_missing_or_unknown: candidate.appliances_missing_or_unknown,
        },
        summary: `review signals changed`,
      });
    }
  }

  return out;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/unit/change_detection.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/change_detection.ts tests/unit/change_detection.test.ts
git commit -m "feat: detectChanges returns all relevant change types"
```

---

## Task 12: LINE message body renderer

**Files:**
- Create: `src/domain/message.ts`
- Test: `tests/unit/message.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/message.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderMessage } from "@/domain/message";
import { validCandidate } from "../fixtures/candidates";

const triageUrl = "https://app.example.com/listings/abc123";

describe("renderMessage", () => {
  it("renders a new_listing message with all required fields", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: validCandidate,
      triage_url: triageUrl,
    });
    expect(msg).toContain("[New Listing]");
    expect(msg).toContain("Shilin");
    expect(msg).toContain("TWD 25,000");
    expect(msg).toContain("Layout: 2房1廳1衛");
    expect(msg).toContain("Level: strong");
    expect(msg).toContain("Seen: air_conditioner, refrigerator");
    expect(msg).toContain("Unknown: washing_machine, water_heater");
    expect(msg).toContain(triageUrl);
    expect(msg).toContain(validCandidate.listing_identity.source_url);
  });

  it("renders a price_drop message with price delta", () => {
    const msg = renderMessage({
      event_type: "price_drop",
      candidate: validCandidate,
      triage_url: triageUrl,
      price_drop: { previous: 28000, current: 25000 },
    });
    expect(msg).toContain("[Price Drop]");
    expect(msg).toContain("28,000");
    expect(msg).toContain("25,000");
  });

  it("marks high concern when photo_review is poor", () => {
    const msg = renderMessage({
      event_type: "new_listing",
      candidate: { ...validCandidate, photo_review: "poor" },
      triage_url: triageUrl,
    });
    expect(msg).toContain("HIGH CONCERN");
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/unit/message.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/domain/message.ts`:

```ts
import type { Candidate, ChangeType } from "./types";

const HEADER: Record<Exclude<ChangeType, "none">, string> = {
  new_listing: "New Listing",
  price_drop: "Price Drop",
  relisted: "Relisted",
  became_candidate: "Now a Candidate",
  material_listing_change: "Listing Updated",
  review_change: "Review Updated",
};

export interface RenderInput {
  event_type: Exclude<ChangeType, "none">;
  candidate: Candidate;
  triage_url: string;
  price_drop?: { previous: number; current: number };
}

export function renderMessage(input: RenderInput): string {
  const { event_type, candidate, triage_url, price_drop } = input;
  const c = candidate;
  const header = `[${HEADER[event_type]}] ${c.district} ${c.layout.split("房")[0]}BR TWD ${fmt(c.rent_price)}`;

  const lines: string[] = [header, ""];

  if (event_type === "price_drop" && price_drop) {
    lines.push(`Rent: TWD ${fmt(price_drop.current)}/month (was TWD ${fmt(price_drop.previous)})`);
  } else {
    lines.push(`Rent: TWD ${fmt(c.rent_price)}/month`);
  }

  lines.push(
    `District: ${c.district}`,
    `Layout: ${c.layout}`,
    `Area: ${c.area_ping ?? "?"} ping`,
    `Floor: ${c.floor ?? "?"}`,
    `Level: ${c.score_level}`,
    `Photo review: ${c.photo_review}`,
    `Appliance review: ${c.appliance_review}`,
  );

  if (c.appliances_seen.length > 0) lines.push(`Seen: ${c.appliances_seen.join(", ")}`);
  if (c.appliances_missing_or_unknown.length > 0)
    lines.push(`Unknown: ${c.appliances_missing_or_unknown.join(", ")}`);

  if (c.recommendation_reason) lines.push(`Why it is worth checking: ${c.recommendation_reason}`);
  if (c.concerns.length > 0) lines.push(`Concerns: ${c.concerns.join("; ")}`);

  if (c.photo_review === "poor") lines.push("⚠ HIGH CONCERN: photos look poor; confirm manually");

  lines.push(`591: ${c.listing_identity.source_url}`, `Triage: ${triage_url}`);
  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/unit/message.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/message.ts tests/unit/message.test.ts
git commit -m "feat: LINE message renderer for new_listing + price_drop + high-concern"
```

---

## Task 13: LINE Messaging API client

**Files:**
- Create: `src/services/line.ts`
- Create: `tests/fixtures/line_mock.ts`
- Test: `tests/integration/line_push.test.ts`

- [ ] **Step 1: Write fixture helper**

Create `tests/fixtures/line_mock.ts`:

```ts
import { vi } from "vitest";

export function mockFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function mockFetchFail(status = 500, body = { message: "err" }): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
```

- [ ] **Step 2: Write failing tests**

Create `tests/integration/line_push.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pushLineMessage } from "@/services/line";
import { mockFetchOk, mockFetchFail } from "../fixtures/line_mock";

beforeEach(() => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
  process.env.LINE_USER_ID = "U-test";
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.AUTOMATION_SECRET = "01234567890123456789";
});

afterEach(() => vi.unstubAllGlobals());

describe("pushLineMessage", () => {
  it("POSTs to LINE with bearer token and JSON body", async () => {
    const fetchMock = mockFetchOk();
    const result = await pushLineMessage("hello");
    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("U-test");
    expect(body.messages[0]).toEqual({ type: "text", text: "hello" });
  });

  it("returns failed status on non-2xx response", async () => {
    mockFetchFail(500, { message: "boom" });
    const result = await pushLineMessage("hello");
    expect(result.status).toBe("failed");
    expect(result.response).toMatchObject({ status: 500 });
  });
});
```

- [ ] **Step 3: Run, confirm fails**

Run: `pnpm test tests/integration/line_push.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

Create `src/services/line.ts`:

```ts
import { loadServerEnv } from "@/config/env";

export interface LineResult {
  status: "sent" | "failed";
  response: Record<string, unknown>;
}

export async function pushLineMessage(text: string): Promise<LineResult> {
  const env = loadServerEnv();
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: env.LINE_USER_ID,
      messages: [{ type: "text", text }],
    }),
  });

  const bodyText = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parsed = { raw: bodyText };
  }

  if (!res.ok) {
    return { status: "failed", response: { status: res.status, body: parsed } };
  }
  return { status: "sent", response: { status: res.status, body: parsed } };
}
```

- [ ] **Step 5: Tests pass**

Run: `pnpm test tests/integration/line_push.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/services/line.ts tests/fixtures/line_mock.ts tests/integration/line_push.test.ts
git commit -m "feat: LINE Messaging API push client with structured result"
```

---

## Task 14: `upsert_listing` handler (orchestration)

**Files:**
- Create: `src/mcp/handlers/upsert_listing.ts`
- Test: `tests/integration/upsert_listing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/upsert_listing.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
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

describe("handleUpsertListing", () => {
  it("creates listing, review, and change for a new listing and returns should_notify=true", async () => {
    const result = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    expect(result.should_notify).toBe(true);
    expect(result.event_type).toBe("new_listing");
    expect(result.event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.message_body).toContain("[New Listing]");
  });

  it("returns should_notify=false on repeat call with no change", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    const second = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-2",
      triage_base_url: "https://app.example.com",
    });
    expect(second.should_notify).toBe(false);
  });

  it("returns should_notify=true with event_type=price_drop on rent decrease", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    const dropped = { ...validCandidate, rent_price: 23000 };
    const second = await handleUpsertListing({
      candidate: dropped,
      run_id: "run-2",
      triage_base_url: "https://app.example.com",
    });
    expect(second.should_notify).toBe(true);
    expect(second.event_type).toBe("price_drop");
    expect(second.message_body).toContain("[Price Drop]");
  });

  it("rejects invalid candidate", async () => {
    const bad = { ...validCandidate, rent_price: 99999 };
    await expect(
      handleUpsertListing({
        candidate: bad as unknown as typeof validCandidate,
        run_id: "run-1",
        triage_base_url: "https://app.example.com",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/integration/upsert_listing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/mcp/handlers/upsert_listing.ts`:

```ts
import { CandidateSchema } from "@/domain/schema";
import type { Candidate, ChangeType } from "@/domain/types";
import { detectChanges, type PriorSnapshot } from "@/domain/change_detection";
import { computeEventHash, type EventType } from "@/domain/event_hash";
import { renderMessage } from "@/domain/message";
import {
  findListingByIdentity,
  upsertListing,
  type ListingRow,
} from "@/services/repositories/listings";
import { fetchLatestReview, insertReview } from "@/services/repositories/reviews";
import { insertChange } from "@/services/repositories/changes";
import { hasPriorSentNotification } from "@/services/repositories/notifications";

export interface UpsertListingInput {
  candidate: Candidate;
  run_id: string;
  triage_base_url: string;
}

export interface UpsertListingResult {
  should_notify: boolean;
  event_type: ChangeType;
  event_hash: string | null;
  message_body: string | null;
  listing_id: string;
}

const PRIORITY: EventType[] = [
  "price_drop",
  "became_candidate",
  "new_listing",
  "review_change",
  "material_listing_change",
  "relisted",
];

export async function handleUpsertListing(
  input: UpsertListingInput,
): Promise<UpsertListingResult> {
  const candidate = CandidateSchema.parse(input.candidate) as Candidate;

  const prior = await findListingByIdentity(
    candidate.listing_identity.source,
    candidate.listing_identity.source_listing_id,
  );
  const priorReview = prior ? await fetchLatestReview(prior.id) : null;

  const priorSnapshot: PriorSnapshot | null = prior
    ? {
        rent_price: prior.rent_price,
        district: prior.district,
        address_summary: prior.address_summary,
        layout: prior.layout,
        area_ping: prior.area_ping,
        floor: prior.floor,
        score_level: (priorReview?.score_level as PriorSnapshot["score_level"]) ?? "normal",
        photo_review: priorReview?.photo_review ?? "",
        appliance_review: priorReview?.appliance_review ?? "",
        appliances_seen: priorReview?.appliances_seen ?? [],
        appliances_missing_or_unknown: priorReview?.appliances_missing_or_unknown ?? [],
      }
    : null;

  const priorReviewSnapshot: PriorSnapshot | null = priorReview
    ? {
        rent_price: prior!.rent_price,
        district: prior!.district,
        address_summary: prior!.address_summary,
        layout: prior!.layout,
        area_ping: prior!.area_ping,
        floor: prior!.floor,
        score_level: priorReview.score_level as PriorSnapshot["score_level"],
        photo_review: priorReview.photo_review,
        appliance_review: priorReview.appliance_review,
        appliances_seen: priorReview.appliances_seen,
        appliances_missing_or_unknown: priorReview.appliances_missing_or_unknown,
      }
    : null;

  const listing: ListingRow = await upsertListing(candidate);
  await insertReview({ listing_id: listing.id, run_id: input.run_id, candidate });

  const detected = detectChanges({
    prior: priorSnapshot,
    priorReview: priorReviewSnapshot,
    candidate,
  });

  for (const change of detected) {
    await insertChange({
      listing_id: listing.id,
      run_id: input.run_id,
      change_type: change.change_type,
      before_snapshot: priorSnapshot as Record<string, unknown> | null,
      after_snapshot: { candidate },
      change_summary: change.summary,
    });
  }

  if (detected.length === 0 || candidate.score_level === "reject") {
    return {
      should_notify: false,
      event_type: "none",
      event_hash: null,
      message_body: null,
      listing_id: listing.id,
    };
  }

  const chosen = pickPriority(detected);
  const event_hash = computeEventHash({
    event_type: chosen.change_type,
    source: "591",
    source_listing_id: candidate.listing_identity.source_listing_id,
    payload: chosen.payload,
  });

  const already = await hasPriorSentNotification(listing.id, chosen.change_type, event_hash);
  if (already) {
    return {
      should_notify: false,
      event_type: chosen.change_type,
      event_hash,
      message_body: null,
      listing_id: listing.id,
    };
  }

  const triage_url = `${input.triage_base_url.replace(/\/$/, "")}/listings/${listing.id}`;
  const message_body = renderMessage({
    event_type: chosen.change_type,
    candidate,
    triage_url,
    price_drop:
      chosen.change_type === "price_drop"
        ? {
            previous: chosen.payload.previous_rent_price as number,
            current: chosen.payload.current_rent_price as number,
          }
        : undefined,
  });

  return {
    should_notify: true,
    event_type: chosen.change_type,
    event_hash,
    message_body,
    listing_id: listing.id,
  };
}

function pickPriority(changes: ReturnType<typeof detectChanges>) {
  for (const kind of PRIORITY) {
    const hit = changes.find((c) => c.change_type === kind);
    if (hit) return hit;
  }
  return changes[0]!;
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/integration/upsert_listing.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/handlers/upsert_listing.ts tests/integration/upsert_listing.test.ts
git commit -m "feat: upsert_listing handler with change priority + dedupe check"
```

---

## Task 15: `get_known_listings` handler

**Files:**
- Create: `src/mcp/handlers/get_known_listings.ts`
- Test: `tests/integration/get_known_listings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/get_known_listings.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleGetKnownListings } from "@/mcp/handlers/get_known_listings";
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

describe("handleGetKnownListings", () => {
  it("returns an empty list when no listings", async () => {
    const out = await handleGetKnownListings({ source: "591" });
    expect(out).toEqual([]);
  });

  it("returns recent listings with review signals", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    const out = await handleGetKnownListings({ source: "591" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source_listing_id: "abc123",
      rent_price: 25000,
      score_level: "strong",
    });
  });

  it("respects the since filter", async () => {
    await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    const out = await handleGetKnownListings({ source: "591", since: future });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/integration/get_known_listings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/mcp/handlers/get_known_listings.ts`:

```ts
import { getServerClient } from "@/services/supabase";

export interface KnownListing {
  source_listing_id: string;
  source_url: string;
  last_seen_at: string;
  rent_price: number;
  current_status: string;
  score_level: string | null;
  photo_review: string | null;
  appliance_review: string | null;
}

export async function handleGetKnownListings(input: {
  source: "591";
  since?: string;
}): Promise<KnownListing[]> {
  const supabase = getServerClient();

  let query = supabase
    .from("listings")
    .select(
      `source_listing_id, source_url, last_seen_at, rent_price, current_status,
       listing_reviews ( score_level, photo_review, appliance_review, reviewed_at )`,
    )
    .eq("source", input.source)
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (input.since) query = query.gte("last_seen_at", input.since);

  const { data, error } = await query;
  if (error) throw new Error(`handleGetKnownListings failed: ${error.message}`);

  return (data ?? []).map((row) => {
    const reviews = (row.listing_reviews ?? []) as Array<{
      score_level: string;
      photo_review: string;
      appliance_review: string;
      reviewed_at: string;
    }>;
    const latest = reviews.sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1))[0] ?? null;
    return {
      source_listing_id: row.source_listing_id,
      source_url: row.source_url,
      last_seen_at: row.last_seen_at,
      rent_price: row.rent_price,
      current_status: row.current_status,
      score_level: latest?.score_level ?? null,
      photo_review: latest?.photo_review ?? null,
      appliance_review: latest?.appliance_review ?? null,
    };
  });
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/integration/get_known_listings.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/handlers/get_known_listings.ts tests/integration/get_known_listings.test.ts
git commit -m "feat: get_known_listings handler with optional since filter"
```

---

## Task 16: `send_line_notification` handler

**Files:**
- Create: `src/mcp/handlers/send_line_notification.ts`
- Test: `tests/integration/send_line_notification.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/send_line_notification.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import { validCandidate } from "../fixtures/candidates";
import { mockFetchOk, mockFetchFail } from "../fixtures/line_mock";

beforeAll(() => {
  config({ path: ".env.local" });
  resetClientForTests();
  loadServerEnv();
});

beforeEach(async () => {
  const supabase = getServerClient();
  await supabase.from("listings").delete().eq("source", "591");
});

afterEach(() => vi.unstubAllGlobals());

describe("handleSendLineNotification", () => {
  it("sends LINE push and records sent notification", async () => {
    const fetchMock = mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    expect(up.should_notify).toBe(true);

    const out = await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    expect(out.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects when (listing_id, event_type, event_hash) already sent", async () => {
    mockFetchOk();
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    await expect(
      handleSendLineNotification({
        listing_id: up.listing_id,
        event_type: up.event_type as "new_listing",
        event_hash: up.event_hash!,
        message_body: up.message_body!,
      }),
    ).rejects.toThrow(/already sent/);
  });

  it("records failed notification on LINE API error", async () => {
    mockFetchFail(500, { message: "boom" });
    const up = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "run-1",
      triage_base_url: "https://app.example.com",
    });
    const out = await handleSendLineNotification({
      listing_id: up.listing_id,
      event_type: up.event_type as "new_listing",
      event_hash: up.event_hash!,
      message_body: up.message_body!,
    });
    expect(out.status).toBe("failed");
    const supabase = getServerClient();
    const { data } = await supabase
      .from("notifications")
      .select("status")
      .eq("listing_id", up.listing_id);
    expect(data?.map((d) => d.status)).toContain("failed");
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/integration/send_line_notification.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/mcp/handlers/send_line_notification.ts`:

```ts
import { pushLineMessage } from "@/services/line";
import {
  hasPriorSentNotification,
  insertNotification,
} from "@/services/repositories/notifications";

export interface SendLineNotificationInput {
  listing_id: string;
  event_type: string;
  event_hash: string;
  message_body: string;
}

export interface SendLineNotificationResult {
  status: "sent" | "failed";
  notification_id: string;
}

export async function handleSendLineNotification(
  input: SendLineNotificationInput,
): Promise<SendLineNotificationResult> {
  const already = await hasPriorSentNotification(
    input.listing_id,
    input.event_type,
    input.event_hash,
  );
  if (already) {
    throw new Error(
      `notification already sent for listing ${input.listing_id} event ${input.event_type} hash ${input.event_hash.slice(0, 8)}`,
    );
  }

  const pushResult = await pushLineMessage(input.message_body);

  const row = await insertNotification({
    listing_id: input.listing_id,
    event_type: input.event_type,
    event_hash: input.event_hash,
    message_body: input.message_body,
    status: pushResult.status,
    provider_response: pushResult.response,
  });

  return { status: pushResult.status, notification_id: row.id };
}
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/integration/send_line_notification.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/handlers/send_line_notification.ts tests/integration/send_line_notification.test.ts
git commit -m "feat: send_line_notification handler with dedupe + outcome record"
```

---

## Task 17: MCP route with bearer auth

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Test: `tests/integration/mcp_route.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/mcp_route.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { POST } from "@/app/api/mcp/route";
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

afterEach(() => vi.unstubAllGlobals());

function initializeRequest(token: string) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
}

describe("/api/mcp route", () => {
  it("rejects requests without bearer token", async () => {
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer token", async () => {
    const res = await POST(initializeRequest("wrong-token"));
    expect(res.status).toBe(401);
  });

  it("lists the three tools when authenticated", async () => {
    mockFetchOk();
    const res = await POST(initializeRequest(process.env.AUTOMATION_SECRET!));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names.sort()).toEqual(
      ["get_known_listings", "send_line_notification", "upsert_listing"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run, confirm fails**

Run: `pnpm test tests/integration/mcp_route.test.ts`
Expected: FAIL (route not defined).

- [ ] **Step 3: Implement the route**

Create `src/app/api/mcp/route.ts`:

```ts
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleGetKnownListings } from "@/mcp/handlers/get_known_listings";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import { CandidateSchema } from "@/domain/schema";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "upsert_listing",
      {
        title: "Upsert Listing",
        description:
          "Validate a candidate listing, store it with review and change detection, and return whether LINE should be notified.",
        inputSchema: {
          candidate: CandidateSchema,
          run_id: z.string().min(1),
          triage_base_url: z.string().url(),
        },
      },
      async (input) => {
        const result = await handleUpsertListing(input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    );

    server.registerTool(
      "get_known_listings",
      {
        title: "Get Known Listings",
        description:
          "Return up to 500 recent listings with latest review signals so the agent can skip unchanged ones.",
        inputSchema: {
          source: z.literal("591"),
          since: z.string().datetime().optional(),
        },
      },
      async (input) => {
        const result = await handleGetKnownListings(input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    );

    server.registerTool(
      "send_line_notification",
      {
        title: "Send LINE Notification",
        description:
          "Push a LINE message and record the outcome. Rejects duplicates by (listing_id, event_type, event_hash).",
        inputSchema: {
          listing_id: z.string().uuid(),
          event_type: z.string().min(1),
          event_hash: z.string().regex(/^[0-9a-f]{64}$/),
          message_body: z.string().min(1),
        },
      },
      async (input) => {
        const result = await handleSendLineNotification(input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const env = loadServerEnv();
  if (bearerToken !== env.AUTOMATION_SECRET) return undefined;
  return { token: bearerToken, scopes: ["mcp:call"], clientId: "house-search-runner" };
};

const authed = withMcpAuth(handler, verifyToken, { required: true });

export { authed as GET, authed as POST };
```

- [ ] **Step 4: Tests pass**

Run: `pnpm test tests/integration/mcp_route.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Smoke-test the route locally**

Terminal 1: `pnpm dev`
Terminal 2:
```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "authorization: Bearer $(grep AUTOMATION_SECRET .env.local | cut -d= -f2)" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq .
```
Expected: JSON listing three tools.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp/route.ts tests/integration/mcp_route.test.ts
git commit -m "feat: mount MCP server at /api/mcp with bearer auth"
```

---

## Task 18: End-to-end integration test

**Files:**
- Test: `tests/integration/e2e.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/e2e.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";
import { handleGetKnownListings } from "@/mcp/handlers/get_known_listings";
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

afterEach(() => vi.unstubAllGlobals());

describe("end-to-end agent flow", () => {
  it("upsert → notify → repeat upsert → no-notify → price drop → notify", async () => {
    mockFetchOk();

    // First run: new listing
    const first = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r1",
      triage_base_url: "https://app.example.com",
    });
    expect(first.should_notify).toBe(true);

    const sent = await handleSendLineNotification({
      listing_id: first.listing_id,
      event_type: first.event_type as "new_listing",
      event_hash: first.event_hash!,
      message_body: first.message_body!,
    });
    expect(sent.status).toBe("sent");

    // Second run, identical candidate: no notify
    const second = await handleUpsertListing({
      candidate: validCandidate,
      run_id: "r2",
      triage_base_url: "https://app.example.com",
    });
    expect(second.should_notify).toBe(false);

    // Third run, price drop: notify
    const third = await handleUpsertListing({
      candidate: { ...validCandidate, rent_price: 22000 },
      run_id: "r3",
      triage_base_url: "https://app.example.com",
    });
    expect(third.should_notify).toBe(true);
    expect(third.event_type).toBe("price_drop");

    // Known listings reflects latest
    const known = await handleGetKnownListings({ source: "591" });
    expect(known).toHaveLength(1);
    expect(known[0]!.rent_price).toBe(22000);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test tests/integration/e2e.test.ts`
Expected: 1 passed.

- [ ] **Step 3: Run full suite**

Run: `pnpm test`
Expected: all prior tests still pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/e2e.test.ts
git commit -m "test: end-to-end agent flow (upsert → notify → dedupe → price_drop)"
```

---

## Task 19: Type-check + lint pass

**Files:**
- Modify: `package.json` (add `lint` if missing)

- [ ] **Step 1: Add ESLint (Next.js preset)**

Run: `pnpm add -D eslint eslint-config-next@^15 @typescript-eslint/parser @typescript-eslint/eslint-plugin`

Create `.eslintrc.json`:

```json
{
  "extends": ["next/core-web-vitals"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors. Fix any errors discovered (most likely Supabase row types or unknown narrowing).

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.json package.json pnpm-lock.yaml
git commit -m "chore: add eslint config and enforce typecheck"
```

---

## Task 20: Real LINE smoke test (manual)

**Files:** none (manual verification only)

- [ ] **Step 1: Trigger a real LINE push**

Ensure `.env.local` has real `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_USER_ID`. Then run a one-off script:

```bash
pnpm tsx -e "import { pushLineMessage } from './src/services/line'; import { config } from 'dotenv'; config({ path: '.env.local' }); pushLineMessage('house-search smoke test').then(r => console.log(r));"
```

Expected: output `{ status: 'sent', ... }` and a message arrives in your LINE client.

- [ ] **Step 2: Verify end-to-end against dev Supabase**

Run a smoke script that calls `handleUpsertListing` then `handleSendLineNotification` against real LINE + dev Supabase:

```bash
pnpm tsx scripts/smoke_end_to_end.ts
```

Create the script at `scripts/smoke_end_to_end.ts`:

```ts
import { config } from "dotenv";
import { handleUpsertListing } from "@/mcp/handlers/upsert_listing";
import { handleSendLineNotification } from "@/mcp/handlers/send_line_notification";

config({ path: ".env.local" });

const candidate = {
  listing_identity: {
    source: "591" as const,
    source_listing_id: `smoke-${Date.now()}`,
    source_url: "https://rent.591.com.tw/home/smoke",
  },
  title: "Smoke Test Listing",
  rent_price: 24000,
  district: "Shilin",
  address_summary: "Shilin District smoke test",
  layout: "2房1廳1衛",
  area_ping: 18,
  floor: "4F/5F",
  score_level: "strong" as const,
  photo_review: "acceptable" as const,
  appliance_review: "complete" as const,
  appliances_seen: ["air_conditioner", "refrigerator", "washing_machine", "water_heater"] as const,
  appliances_missing_or_unknown: [] as const,
  recommendation_reason: "smoke test",
  concerns: [],
  change_type: "new_listing" as const,
  should_notify: true,
};

const up = await handleUpsertListing({
  candidate,
  run_id: `smoke-${Date.now()}`,
  triage_base_url: "https://house-search.vercel.app",
});
console.log("upsert:", up);

if (up.should_notify) {
  const sent = await handleSendLineNotification({
    listing_id: up.listing_id,
    event_type: up.event_type as "new_listing",
    event_hash: up.event_hash!,
    message_body: up.message_body!,
  });
  console.log("send:", sent);
}
```

Expected: a LINE message arrives with the smoke candidate. A row exists in Supabase `listings`, `listing_reviews`, `listing_changes`, `notifications`.

- [ ] **Step 3: Clean up dev data**

In Supabase Studio SQL editor, run:
```sql
delete from listings where source_listing_id like 'smoke-%';
```

- [ ] **Step 4: Commit the smoke script**

```bash
git add scripts/smoke_end_to_end.ts
git commit -m "chore: add end-to-end smoke script for real LINE + dev supabase"
```

---

## Task 21: Apply migrations to prod Supabase

**Files:** none (deployment action)

- [ ] **Step 1: Link prod Supabase project**

Run:
```bash
supabase link --project-ref <your-prod-project-ref>
```

- [ ] **Step 2: Push migrations**

Run: `supabase db push`
Expected: both migrations applied to prod.

- [ ] **Step 3: Relink dev for future work**

Run:
```bash
supabase link --project-ref <your-dev-project-ref>
```

This avoids accidentally pushing test changes to prod.

- [ ] **Step 4: No commit needed** — this is a one-time deployment action.

---

## Task 22: Deploy to Vercel

**Files:**
- Create: `vercel.json` (optional but explicit)

- [ ] **Step 1: Push branch to GitHub**

```bash
git push -u origin feat/plan-1-backend
```

- [ ] **Step 2: Open PR and merge to main**

Either via `gh`:
```bash
gh pr create --title "Plan 1: backend (Supabase + MCP + LINE)" --body "Implements the backend per docs/superpowers/plans/2026-04-16-plan-1-backend.md"
gh pr merge --squash
```
Or via the GitHub UI. Merge when CI (if any) is green.

- [ ] **Step 3: Connect repo to Vercel**

In the Vercel dashboard, link the project to `alexsui/HouseSearchAutomation`. Set the production branch to `main`. Framework preset: Next.js.

- [ ] **Step 4: Set production env vars**

In Vercel project → Settings → Environment Variables, for Production scope:

- `SUPABASE_URL` = prod Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` = prod service-role key
- `LINE_CHANNEL_ACCESS_TOKEN` = from the LINE setup
- `LINE_USER_ID` = from the LINE setup
- `AUTOMATION_SECRET` = the `openssl rand -hex 32` value from prerequisites
- `TRIAGE_PASSWORD` = placeholder (Plan 2 will use it)
- `NEXT_PUBLIC_SITE_URL` = the final Vercel URL, e.g. `https://house-search.vercel.app`

- [ ] **Step 5: Deploy**

Either wait for the merge-triggered deploy or run `vercel --prod`. Watch the deployment logs for build errors.

- [ ] **Step 6: Smoke-test production MCP endpoint**

```bash
curl -s -X POST https://<vercel-url>/api/mcp \
  -H "authorization: Bearer <AUTOMATION_SECRET>" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq .
```

Expected: JSON listing three tools. If 401, check the env var. If 500, check Vercel logs.

- [ ] **Step 7: Document the deployed URL**

Add a line to the repo README (create one if missing):

```
Backend live at https://<vercel-url>
MCP endpoint: https://<vercel-url>/api/mcp (bearer-auth; AUTOMATION_SECRET)
```

- [ ] **Step 8: Commit any post-deploy docs**

```bash
git checkout main
git pull
# edit README if created
git add README.md
git commit -m "docs: record production backend URL"
git push
```

---

## Self-Review Checklist (run after all tasks complete)

- [ ] **Spec coverage:**
  - Data model — Task 7 covers all five tables.
  - `event_hash` canonical rules — Tasks 5 + 6 cover the canonical-json + sha256 rules per event type.
  - Three MCP tools (`upsert_listing`, `get_known_listings`, `send_line_notification`) — Tasks 14–16.
  - Bearer-token auth on MCP — Task 17.
  - LINE message format — Task 12.
  - Validation-plan items: dedupe (Tasks 10, 14, 16), malformed rejection (Task 4 + Task 17 schema), LINE failure → `failed` row + retry path (Task 16), missing identity rejection (Task 4).
  - Triage-site + login-attempts table + CSRF origin check — NOT in Plan 1. They belong to Plan 2.
- [ ] **Placeholder scan:** none of the "TBD / implement later / handle errors" patterns used — every step has concrete code or a concrete command.
- [ ] **Type consistency:** `ListingRow`, `ReviewRow`, `ChangeRow`, `NotificationRow`, `Candidate`, `ChangeType`, `EventType`, `KnownListing` consistent across tasks. `handleUpsertListing` input/output matches the route handler's schema and the e2e test.
- [ ] **Secrets:** no secret is ever committed; `.env.local` is gitignored; prod vars live in Vercel.

## Out-of-scope reminders for Plan 1

- Triage site UI, login rate-limiting, CSRF origin check → **Plan 2**.
- Runbook skill, trigger prompt, GitHub/MCP connector registration on the runner account → **Plan 3**.

---

## Acceptance Criteria for Plan 1

Plan 1 is complete when:

- `pnpm test` passes (unit + integration against dev Supabase + mocked LINE).
- The real-LINE smoke script (Task 20) delivers a message and writes the expected Supabase rows.
- Production Vercel URL responds to `tools/list` with three tools when called with the correct bearer token and returns 401 without it.
- Both dev and prod Supabase projects have the schema applied and no data drift.
