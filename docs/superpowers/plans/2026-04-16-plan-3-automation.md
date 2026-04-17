# Automation + Remote Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-repo runbook skill and the configuration it needs, then stand up the hourly Claude Code remote trigger on the dedicated runner account so the backend from Plan 1 receives real 591 candidates every hour.

**Architecture:** No new server code. The trigger runs in Anthropic's cloud, clones this repo, reads the runbook in `.claude/skills/house-search-runbook/SKILL.md`, fetches 591 via `WebFetch`, downloads images via `Bash curl` into `/tmp`, `Read`s them as multimodal images, and calls the MCP connector's three tools from Plan 1. All scoring/validation/dedupe happens server-side in the MCP tools. The runbook is prose the agent reads at run time — it is not code that is tested with unit tests. Stabilization happens through dry-runs against real 591, tuning the runbook, and re-running.

**Tech Stack:** YAML for the search config, Markdown for the skill, Zod for one config validator, no new packages.

**Branch:** `feat/plan-3-automation`.

**Depends on:** Plan 1 deployed to production (MCP endpoint live), Plan 2 optional but recommended (so triage URLs in LINE messages lead somewhere).

---

## Task 0: Prerequisites on the runner account

Complete these before any other task. They happen on the dedicated Claude Code runner account, not the development account used for the rest of this plan.

- [ ] **Step 1: Install GitHub CLI locally on the runner account's machine**

On any machine signed into the runner Claude account:
```bash
brew install gh     # or platform equivalent
gh auth login        # choose HTTPS, authenticate via browser
gh auth status       # verify
```

- [ ] **Step 2: Sync GitHub access to claude.ai**

Open a Claude Code session on the runner account (in any directory — this step is account-wide, not repo-scoped):
```
/web-setup
```
Confirm the success message. The runner account now has read access to any repo `gh` can see.

- [ ] **Step 3: Register the MCP connector**

At https://claude.ai/settings/connectors on the runner account:

- Add connector: **Custom / Streamable HTTP MCP**
- Name: `house-search-mcp` (must be `[a-zA-Z0-9_-]` only)
- URL: `https://<your-vercel-production-url>/api/mcp`
- Auth: Bearer token = the `AUTOMATION_SECRET` value from Vercel (the development account must send this to the runner account via a secure channel; it must **not** appear in this repo or any other shared location).

- [ ] **Step 4: Smoke-test the connector**

Still in a Claude Code session on the runner account, run:
```
Using the house-search-mcp connector, call tools/list and show the tool names.
```
Expected: three tools — `upsert_listing`, `get_known_listings`, `send_line_notification`.

If this fails, stop and investigate before proceeding. Likely causes: wrong URL, wrong bearer, Vercel deploy not ready, or MCP endpoint failing.

- [ ] **Step 5: Smoke-test `get_known_listings`**

```
Using the house-search-mcp connector, call get_known_listings with {"source":"591"} and show the count.
```
Expected: a number (may be 0 if no listings stored yet, or whatever Plan 1's smoke test left behind).

---

## Task 1: Search groups config + schema

**Files:**
- Create: `config/search_groups.yaml`
- Create: `src/config/search_groups.ts`
- Test: `tests/unit/search_groups.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/search_groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSearchGroups } from "@/config/search_groups";

describe("search_groups config", () => {
  it("parses the repo config file", () => {
    const raw = readFileSync(path.join(process.cwd(), "config/search_groups.yaml"), "utf8");
    const groups = parseSearchGroups(raw);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const g of groups) {
      expect(g.name).toMatch(/\S/);
      expect(g.search_urls.length).toBeGreaterThan(0);
      expect(g.priority).toBeGreaterThanOrEqual(1);
    }
  });

  it("rejects invalid YAML", () => {
    expect(() => parseSearchGroups("not: [valid")).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => parseSearchGroups("- name: x")).toThrow();
  });
});
```

- [ ] **Step 2: Install YAML**

Run: `pnpm add yaml`.

- [ ] **Step 3: Implement parser**

Create `src/config/search_groups.ts`:

```ts
import { z } from "zod";
import { parse as parseYaml } from "yaml";

const GroupSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(1).max(10),
  districts: z.array(z.string()).min(1),
  search_urls: z.array(z.string().url()).min(1),
  note: z.string().optional(),
});

const RootSchema = z.array(GroupSchema).min(1);

export type SearchGroup = z.infer<typeof GroupSchema>;

export function parseSearchGroups(raw: string): SearchGroup[] {
  const parsed = parseYaml(raw);
  return RootSchema.parse(parsed);
}
```

- [ ] **Step 4: Write the config**

Create `config/search_groups.yaml`:

```yaml
- name: neihu_adjacent
  priority: 1
  districts: [Neihu, Nangang, Xizhi]
  search_urls:
    - https://rent.591.com.tw/list?region=1&section=120,118&rentprice=,30000&shType=2&multiRoom=2,3
    - https://rent.591.com.tw/list?region=1&section=117&rentprice=,30000&shType=2&multiRoom=2,3
    - https://rent.591.com.tw/list?region=3&section=28&rentprice=,30000&shType=2&multiRoom=2,3
  note: >
    Neihu, Nangang, Xizhi MRT corridor. 591 region/section codes are approximate; verify
    in the 591 UI and update if the returned districts do not match.

- name: environment_preference
  priority: 2
  districts: [Shilin, Zhishan, Mingde, Shipai]
  search_urls:
    - https://rent.591.com.tw/list?region=1&section=107&rentprice=,30000&shType=2&multiRoom=2,3
    - https://rent.591.com.tw/list?region=1&section=104&rentprice=,30000&shType=2&multiRoom=2,3
  note: >
    Environment preference: Shilin / Beitou corridor. Zhishan/Mingde/Shipai are stations
    inside these districts — filter by station in the 591 UI if you want to narrow.

- name: exploratory
  priority: 3
  districts: [Songshan, Dazhi, Jiannan]
  search_urls:
    - https://rent.591.com.tw/list?region=1&section=105&rentprice=,30000&shType=2&multiRoom=2,3
  note: >
    Exploratory — do not treat matches here as evidence the commute works. Low priority.
```

Update each URL to the real 591 search URL for each area after verifying in a browser. The region/section codes in 591 are documented indirectly (inspect the URL when you filter in the UI).

- [ ] **Step 5: Tests pass**

Run: `pnpm test tests/unit/search_groups.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/plan-3-automation
git add config/search_groups.yaml src/config/search_groups.ts tests/unit/search_groups.test.ts package.json pnpm-lock.yaml
git commit -m "feat: search groups config with zod validation"
```

---

## Task 2: Runbook skill

**Files:**
- Create: `.claude/skills/house-search-runbook/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `.claude/skills/house-search-runbook/SKILL.md`:

```markdown
---
name: house-search-runbook
description: |
  Use for the scheduled house-search automation. Reads fixed 591 search groups from
  config/search_groups.yaml, evaluates new or changed listings against the photo/appliance
  rubric, and submits candidates to the house-search-mcp connector which owns validation,
  storage, change detection, and LINE dispatch.
---

# House Search Runbook

You are the scheduled hourly agent for a personal Taipei rental search. You read public
591 pages, judge listing photos and descriptions, and submit structured candidates to the
`house-search-mcp` connector. The connector is the source of truth; you are not.

## Inputs you can rely on

- The repo is cloned and the current working directory is the repo root.
- The `house-search-mcp` connector is registered and has three tools:
  - `upsert_listing`
  - `get_known_listings`
  - `send_line_notification`
- Built-in tools: `WebFetch`, `Bash`, `Read`, `Glob`, `Grep`, `Write`.
- `config/search_groups.yaml` defines the fixed search groups.

## Hard rules

1. **Do not improvise scope.** Only visit 591 search pages listed in `config/search_groups.yaml`.
2. **Only public 591 pages.** Do not attempt login, 591 favorites, or private messaging.
3. **Respect the TWD 30,000 ceiling.** Do not submit listings above 30,000 TWD.
4. **Call MCP tools for every write.** Never write to Supabase or LINE directly.
5. **The MCP response is authoritative.** Your `change_type` and `should_notify` fields in
   the candidate JSON are advisory; use whatever the `upsert_listing` response tells you.
6. **When evidence is weak, say so.** Write "needs manual confirmation" in `concerns` rather
   than pretending to know.

## Step-by-step procedure

### 1. Load configuration

```bash
cat config/search_groups.yaml
```

Parse the groups mentally; you do not need to write a validator here — the runbook treats
the file as authoritative. Note each group's `name`, `search_urls`, and `districts`.

### 2. Retrieve known listings

Call the `get_known_listings` MCP tool with `{"source": "591"}`. Keep the result for dedupe:
a listing appears here if it has been seen recently, along with its latest review signals
and rent price.

### 3. Iterate through each search group

For each group, for each URL in `search_urls`:

- `WebFetch` the URL. Extract all `/home/<id>` or `/rent/<id>` style listing links and basic
  card data (rent price, layout teaser). 591 search pages are HTML — extract IDs via simple
  string matching.
- For each extracted listing ID, decide whether to open the detail page:
  - If the listing is absent from `known_listings`, **open it**.
  - If it is present but the `rent_price` differs, or it has been more than 24 hours since
    `last_seen_at`, **open it**.
  - Otherwise **skip** it.

### 4. Open each candidate's detail page

- `WebFetch` `https://rent.591.com.tw/home/<id>` (or the canonical detail URL from the card).
- Extract:
  - `title`
  - `rent_price` (integer TWD)
  - `district` — must match one of the district names in the active group's `districts`;
    if not, flag in `concerns` and continue
  - `address_summary` — street or short address text displayed publicly
  - `layout` — 591 uses `2房1廳1衛` style; copy it verbatim
  - `area_ping` — integer or decimal, null if unclear
  - `floor` — `4F/5F` style or null
  - `image_urls` — the listing's photo URLs (up to 10)

### 5. Download and inspect photos

Limit image downloads to the first 6 photos per listing to stay inside sane runtime bounds.

```bash
mkdir -p /tmp/house_search_run_$RUN_ID
cd /tmp/house_search_run_$RUN_ID
curl -sS -L -o "<source_listing_id>-1.jpg" "<image_url_1>" -H "referer: https://rent.591.com.tw/"
# repeat for each image
```

Then `Read` each downloaded file so the image lands in context and you can actually look at it.

If any image fails to download (non-2xx, timeout, zero bytes): note that in `concerns` and
continue. If **all** images fail, set `photo_review = needs_review`.

### 6. Apply the rubric

Photo review:
- `acceptable`: clear indoor photos, normal lighting, clean enough, basic living condition visible.
- `needs_review`: too few photos, incomplete angles, insufficient lighting, unclear rooms.
- `poor`: dirty, damp, moldy, leaky, very dark, severely outdated, heavily cluttered,
  only exterior/floor-plan images, or appears empty without basic equipment.

Required appliances (treat as a set): air_conditioner, refrigerator, washing_machine, water_heater.

Appliance review:
- `complete`: all four visible in photos or explicitly listed in the description.
- `partial`: some visible or described; others unknown.
- `missing`: one or more clearly absent OR the listing states "no basic appliances".

Score level:
- `strong`: rent ≤ 25,000 AND 2-bedroom layout AND photos/appliances acceptable.
- `normal`: 25,001 ≤ rent ≤ 28,000, reasonable condition.
- `loose`: 28,001 ≤ rent ≤ 30,000, only if location/condition/appliances make it worth looking.
- `reject`: not 2-bedroom, poor photos AND missing appliances, or above 30,000 TWD.

### 7. Build candidate JSON

```json
{
  "listing_identity": {
    "source": "591",
    "source_listing_id": "<id>",
    "source_url": "<detail_url>"
  },
  "title": "<title>",
  "rent_price": <int>,
  "district": "<district>",
  "address_summary": "<address>",
  "layout": "<layout>",
  "area_ping": <number or null>,
  "floor": "<string or null>",
  "score_level": "strong|normal|loose|reject",
  "photo_review": "acceptable|needs_review|poor",
  "appliance_review": "complete|partial|missing",
  "appliances_seen": ["air_conditioner", ...],
  "appliances_missing_or_unknown": ["washing_machine", ...],
  "recommendation_reason": "<one short sentence>",
  "concerns": ["<short concern>", "..."],
  "change_type": "new_listing",
  "should_notify": true
}
```

Set `change_type = new_listing` if the listing is new to `known_listings`, otherwise pick
the most relevant: `price_drop`, `material_listing_change`, `review_change`, etc. These are
advisory — the server recomputes.

### 8. Submit each candidate

For each candidate, call `upsert_listing` with:
- `candidate`: the JSON above
- `run_id`: a string unique to this run, e.g. `run-<ISO-timestamp>`
- `triage_base_url`: `https://<your-vercel-production-url>` (no trailing slash)

Read the response:
- `should_notify == true` → call `send_line_notification` with `listing_id`, `event_type`,
  `event_hash`, `message_body` from the response.
- `should_notify == false` → do not notify. Move on.

If `send_line_notification` throws `already sent`: that's fine; it means the server caught a
duplicate. Move on.

### 9. Error handling

- 591 search page fails to fetch: note the failed group/URL and continue to the next group.
- Detail page fails to fetch: skip that listing, note it in the run summary.
- All photos fail to download: set `photo_review = needs_review`, still submit.
- MCP `upsert_listing` returns validation error: log the candidate JSON in the run summary
  for inspection, do not retry blindly.
- MCP network error (non-validation): include the listing in the run summary for next-hour retry.

### 10. Run summary

At the end of the run, `Write` a run summary at `/tmp/run_summary.md` and also
print it to stdout. Include:

- `run_id`
- Per group: URLs fetched, listings seen, candidates submitted, notifications sent, skipped.
- Any failed search URLs, failed detail pages, or validation errors.

Example:

```
run_id: run-2026-04-16T13:00Z
neihu_adjacent: fetched=3 seen=42 submitted=5 notified=2 skipped=37 errors=0
environment_preference: fetched=2 seen=18 submitted=1 notified=0 skipped=17 errors=0
exploratory: fetched=1 seen=7 submitted=0 notified=0 skipped=7 errors=0
failed_searches: []
validation_errors: []
```

## What not to do

- Do not invent listings. If you cannot extract a required field, skip the listing.
- Do not decide to notify outside the MCP response.
- Do not write to Supabase, LINE, or the filesystem except `/tmp/`.
- Do not fetch anything outside 591's public pages and the image hostnames referenced by 591 listings.
- Do not retry a failed MCP call more than once within the same run.
```

- [ ] **Step 2: Verify skill file lints cleanly**

```bash
Glob ".claude/skills/house-search-runbook/SKILL.md"
```

Read back to confirm no malformed frontmatter.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/house-search-runbook/SKILL.md
git commit -m "feat: house-search-runbook skill for remote trigger"
```

---

## Task 3: README pointers for operators

**Files:**
- Create or update: `README.md`

- [ ] **Step 1: Write README section for operators**

Create/update `README.md`:

```markdown
# House Search Automation

Personal Taipei rental search automation. Public 591 only. Hourly run, stored in Supabase,
notified via LINE, triaged on a Vercel site.

## Components

- `src/app/api/mcp/` — MCP server for the automation (Plan 1).
- `src/app/(triage)/` — triage site (Plan 2).
- `.claude/skills/house-search-runbook/SKILL.md` — scheduled-trigger runbook (Plan 3).
- `config/search_groups.yaml` — fixed search URLs for the runbook.

## Adding a new search URL

Edit `config/search_groups.yaml`. The next scheduled run picks it up — no redeploy needed.

## Operator playbook

- **Something's wrong:** check Vercel logs, then Supabase `notifications` table for
  `status = failed` rows, then the trigger's most recent run summary in the Claude Code UI
  on the runner account.
- **Adjust sensitivity:** edit the rubric in `.claude/skills/house-search-runbook/SKILL.md`
  and push. Next run uses the new rubric.
- **Pause the trigger:** on the runner account's Claude Code UI (`https://claude.ai/code/scheduled`),
  disable the house-search-hourly trigger.

## For developers

See `docs/superpowers/plans/` for the three implementation plans and
`docs/superpowers/specs/2026-04-16-house-search-automation-design.md` for the spec.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with operator playbook"
```

---

## Task 4: Push branch, merge, ensure main has the skill

**Files:** none

- [ ] **Step 1: Push and PR**

```bash
git push -u origin feat/plan-3-automation
gh pr create --title "Plan 3: automation runbook + trigger handoff" --body "docs/superpowers/plans/2026-04-16-plan-3-automation.md"
gh pr merge --squash
```

- [ ] **Step 2: Confirm main has skill**

```bash
git checkout main
git pull
Glob ".claude/skills/house-search-runbook/SKILL.md"
```
Expected: file exists on main.

- [ ] **Step 3: Confirm Vercel production is still green**

Visit the triage site; open the MCP endpoint smoke curl from Plan 1 Task 22. Both should work.

---

## Task 5: Runbook dry-run from development account (pre-trigger)

Run this from the development account, in this repo, **before** scheduling anything. The goal
is to burn out obvious runbook bugs (wrong extraction patterns, hotlink-blocked images, etc.)
against the dev Supabase + dev LINE target so you don't discover them at 3am.

**Files:** none (iterative tuning)

- [ ] **Step 1: Configure the dev MCP connector temporarily**

At `claude.ai/settings/connectors` on the **development account**, register `house-search-mcp-dev`
pointing at the same production URL but using the dev Supabase? No — the production URL hits
the prod Supabase. For dry-run purposes, point the connector at a **local** MCP endpoint
running against dev Supabase:

Terminal 1 (in this repo): `pnpm dev`
Expose it: `pnpm dlx ngrok http 3000` (or `cloudflared tunnel --url http://localhost:3000`)
Register the tunnel URL `+/api/mcp` as `house-search-mcp-dev` with the dev `AUTOMATION_SECRET`
(local `.env.local`).

- [ ] **Step 2: In a new Claude Code thread, invoke the runbook**

```
Use @house-search-runbook. Use the house-search-mcp-dev connector. Target: run one cycle
and show me the run summary.
```

Watch for:
- 591 pages being parsed correctly.
- Image downloads succeeding (if hotlink blocks, switch to `Referer: https://rent.591.com.tw/` header, already in the runbook — confirm it's working).
- MCP `upsert_listing` returning 2xx.
- LINE messages arriving (you'll see them in your own LINE — consider using a LINE test target).

- [ ] **Step 3: Fix issues**

Common fixes:
- Update search URLs in `config/search_groups.yaml` to the real 591 URLs.
- Improve extraction guidance in the runbook (e.g., note that 591 uses `/home/<id>`, sometimes `/rent/<id>`).
- Handle the specific HTML structure you see in WebFetch output.
- If images hotlink-block even with `Referer`, add a note to skip image download and set `photo_review = needs_review` for those listings.

Iterate until at least one full group runs cleanly end-to-end and at least one LINE message
arrives with a correct-looking rendered candidate.

- [ ] **Step 4: Commit any runbook fixes**

```bash
git add .claude/skills/house-search-runbook/SKILL.md config/search_groups.yaml
git commit -m "fix: runbook + config tuned after dry-run"
git push
```

- [ ] **Step 5: Tear down the dev connector**

Remove `house-search-mcp-dev` from the dev account's connector list. Kill the tunnel.

---

## Task 6: Create the scheduled trigger on the runner account

Switch to the runner account. The development account is not involved from here.

**Files:** none (trigger is stored at claude.ai)

- [ ] **Step 1: Start a Claude Code session on the runner account**

Open the Claude Code CLI or web session on the runner account. Confirm `/web-setup` was done
(Task 0 Step 2) and the MCP connector is registered (Task 0 Step 3).

- [ ] **Step 2: Invoke the schedule skill**

In the session:
```
/schedule create
```

Or, equivalently, describe the desired trigger and follow the skill's prompts.

- [ ] **Step 3: Configure the trigger**

When prompted:
- Name: `house-search-hourly`
- Cron: `0 * * * *` (hourly, UTC — hourly is timezone-agnostic)
- Enabled: `true`
- Repo: `https://github.com/alexsui/HouseSearchAutomation`
- Environment: Default (`env_01DM6noj6JB9ukgJgDbnjn68`)
- Model: `claude-sonnet-4-6`
- Allowed tools: `Bash`, `Read`, `Write`, `WebFetch`, `Glob`, `Grep`
- MCP connection: `house-search-mcp` (the connector you registered in Task 0)
- Prompt:
  ```
  Read `.claude/skills/house-search-runbook/SKILL.md` first, then follow it exactly.
  Use the `house-search-mcp` connector for all data writes. At the end, write
  `/tmp/run_summary.md` and print its contents.
  ```

- [ ] **Step 4: Confirm creation**

The schedule skill outputs a trigger URL like `https://claude.ai/code/scheduled/<TRIGGER_ID>`.
Save this URL — it's how you'll manage the trigger later.

---

## Task 7: Manual smoke run

**Files:** none

- [ ] **Step 1: Run the trigger now**

From the runner account's Claude Code session:
```
/schedule run
```

Select the `house-search-hourly` trigger.

- [ ] **Step 2: Watch the output**

You should see the agent:
- Fetch `config/search_groups.yaml`.
- Call `get_known_listings`.
- WebFetch search pages.
- Open detail pages for new candidates.
- Download images.
- Submit to `upsert_listing`.
- Possibly call `send_line_notification`.
- Print a run summary.

Expected success signs:
- No fatal errors.
- Run summary shows non-zero listings seen.
- At least one LINE message arrives in your LINE client (if any new/changed listing crosses the notify threshold).
- Triage site shows notified listings.

- [ ] **Step 3: If failures, diagnose**

- Parsing errors → refine the runbook. Commit + push. Re-run.
- 591 HTTP 403/429 → the cloud egress IP might be rate-limited. Reduce per-run load
  (fewer images, fewer detail pages) or add a `sleep` between detail fetches in the runbook.
- MCP 401 → wrong bearer in the connector. Re-paste `AUTOMATION_SECRET`.
- MCP 500 → check Vercel logs; server-side bug in Plan 1.
- LINE failure → check `notifications` table for `failed` rows with `provider_response`.

- [ ] **Step 4: Iterate until a smoke run is clean**

Don't enable recurring until at least one smoke run produces a real LINE message or an
explicit empty-result summary (no listings crossed the threshold, but all groups scanned
cleanly).

---

## Task 8: Enable recurring + monitor the first 24 hours

**Files:** none

- [ ] **Step 1: Enable the trigger**

On the runner account's `https://claude.ai/code/scheduled`, ensure `house-search-hourly` is
`Enabled`.

- [ ] **Step 2: Watch for 24 hours**

After each hourly run (or at end of day), check:

- Runner account's Claude Code UI → Automations → house-search-hourly → last 24 runs.
- Triage site list — are new listings appearing at a plausible rate?
- Supabase `notifications` table — any `status = failed` rows? Query:
  ```sql
  select created_at, listing_id, event_type, provider_response
  from notifications
  where status = 'failed'
  order by created_at desc
  limit 20;
  ```
- Supabase `listings` — is `last_seen_at` advancing each hour for active listings?

- [ ] **Step 3: Tune if needed**

If too noisy (too many LINE messages): tighten the score rubric in the runbook. If too
silent (no messages at all in 24 hours): loosen it, verify search URLs cover intended areas,
or confirm the rate limit/dedupe is not eating everything.

Each tuning pass is: edit runbook → commit → push → next hourly run uses new rubric.

- [ ] **Step 4: No commit for this task** (operations only).

---

## Out-of-scope reminders for Plan 3

- The runbook is prose, not code. Unit tests do not guard its correctness. The dry-run and
  the first-24-hours monitoring are the validation gates.
- If the agent-based approach proves unstable (parsing failures, judgment drift), the Future
  Upgrade in the spec is to replace the runbook with a deterministic crawler that feeds the
  same `upsert_listing` tool.
- Production monitoring / alerting beyond "look at the UI" is out of scope for v1.
- Cloud automations running independently of the runner account's Claude Code app — not yet
  a concern; the schedule skill's triggers run in Anthropic's cloud independent of user
  presence.

---

## Self-Review Checklist

- [ ] **Spec coverage:**
  - Fixed search-group config — Task 1.
  - Runbook/skill with step-by-step runbook matching the spec's "Automation Runbook" section — Task 2.
  - Runner-account handoff (web-setup, MCP connector, trigger creation) — Task 0 + Task 6.
  - Smoke-test first run — Task 7.
  - Monitoring and iteration — Task 8.
- [ ] **Placeholder scan:** none.
- [ ] **Dependencies:**
  - Plan 1 deployed (MCP endpoint live with real `AUTOMATION_SECRET`).
  - Plan 2 deployed (triage URLs in LINE messages work). Optional but makes the messages useful.
- [ ] **Secret hygiene:**
  - `AUTOMATION_SECRET` lives only in Vercel and the runner account's MCP connector. It never
    appears in this repo, the runbook, or the trigger prompt.
  - Triage URL is public (behind password on open).

## Acceptance Criteria for Plan 3

Plan 3 is complete when:

- The `house-search-hourly` trigger exists on the runner account and is enabled.
- One manual smoke run completed without fatal errors, produced a run summary, and
  either delivered a LINE message or explicitly reported "no candidates crossed threshold".
- For 24 hours of recurring runs, no more than one run fails outright (ignoring transient
  591 failures which are expected).
- The triage site shows listings produced by the trigger.
