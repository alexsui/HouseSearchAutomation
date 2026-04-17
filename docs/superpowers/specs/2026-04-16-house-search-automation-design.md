# House Search Automation Design

Date: 2026-04-16 (revised 2026-04-16 — switched execution from Codex automations to Claude Code remote triggers; promoted Vercel MCP server from future-upgrade to v1)

## Goal

Build a first version of a Taiwan rental search automation system for finding two-bedroom rentals in user-approved geographic areas around Neihu and preferred MRT-adjacent neighborhoods. The system should check 591 once per hour, review public listing details and photos, push candidate listings through LINE, and store pushed candidates in a simple Vercel-hosted triage site backed by Supabase.

The first version optimizes for practical usefulness and quick iteration. It should reduce manual browsing and help the user triage candidates, not replace final human judgment or guarantee listing accuracy.

## Confirmed Scope

In scope:

- Source: 591 public rental pages only.
- Frequency: once per hour.
- Execution: Claude Code remote trigger (Anthropic cloud) performs the hourly review.
- Storage: Supabase free tier.
- Website: simple Vercel-hosted triage site with password protection.
- Notification: LINE Messaging API with complete listing summaries.
- Automation interface: Vercel-hosted MCP server wrapping listing, change-detection, and LINE-notification tools.
- Target unit type: two bedrooms and one living room.
- Budget: ideal at or below TWD 25,000, broader search up to TWD 30,000.
- Review: agent evaluates listing photos for basic livability and checks whether basic appliances are visible or described.

Out of scope for v1:

- FB group automation.
- 591 login state, favorites, private messages, or account-specific data.
- Google Maps, transit routing, or walking-time calculation.
- Formal multi-user authentication.
- Calendar scheduling for viewings.
- Automatic landlord contact.
- Full production crawler.

## High-Level Architecture

Use a "Thin Interfaces + Agent Judgment" architecture. The agent is a **Claude Code remote trigger** that runs in Anthropic's cloud on a cron schedule, clones this repo each run, loads an in-repo runbook/skill, and calls a **Vercel-hosted MCP server** for every data write.

Claude Code remote trigger:

- Runs hourly via a cron expression on the dedicated runner account.
- Clones the repo at run time; loads the in-repo skill that defines the runbook.
- Fetches fixed 591 public search and listing pages via `WebFetch` (HTML → structured fields).
- Downloads listing photos via `Bash curl` into a scratch directory and `Read`s them as multimodal images to apply the photo/appliance rubric.
- Produces structured candidate JSON.
- Calls the Vercel-hosted MCP server's tools to submit candidates and trigger notifications.

In-repo runbook + config:

- Fixed search-group configuration.
- Candidate JSON schema (TypeScript types + runtime validator reused by the MCP server).
- Skill/runbook markdown instructing the agent step by step.

Vercel-hosted MCP server:

- Streamable HTTP MCP endpoint, same Next.js deployment as the triage site.
- Bearer-token auth via `AUTOMATION_SECRET` (configured in the runner account's MCP connector at `claude.ai/settings/connectors`).
- Exposes three tools:
  - `upsert_listing` — validates and stores a candidate, detects important changes, returns a notification decision.
  - `get_known_listings` — returns known listing IDs + recent snapshots so the agent can skip unchanged listings.
  - `send_line_notification` — pushes to LINE, records success/failure, enforces dedupe via `event_hash`.
- All candidate validation, change detection, and dedupe logic live server-side. The agent is trusted only to read and summarize; the MCP server is the gate.

Supabase:

- Stores listing identity, snapshots, reviews, changes, notifications, triage status, and notes.
- Acts as the source of truth for the triage site and notification deduplication.

Vercel triage site:

- Shares the same Vercel project as the MCP server (different route namespaces: `/*` for UI, `/api/mcp` for MCP, `/api/*` for browser-facing server actions).
- Password-protected interface.
- Shows only listings that were pushed to LINE or selected for LINE notification.
- Lets the user update triage status and notes.

## Claude Code Remote Trigger Tool Boundary

The remote trigger cannot receive ad-hoc custom tools per run. It relies on built-in Claude Code tools (`Bash`, `WebFetch`, `Read`, `Write`, `Edit`, `Grep`, `Glob`) plus MCP connectors registered on the runner account.

The stable workflow is:

```text
Claude Code remote trigger (hourly cron)
-> clones repo; loads in-repo runbook skill
-> WebFetch 591 public search pages
-> calls get_known_listings MCP tool to filter out unchanged listings
-> WebFetch 591 listing detail pages
-> Bash curl listing photos to /tmp; Read them as images
-> applies photo/appliance rubric + score
-> builds candidate JSON
-> calls upsert_listing MCP tool
    -> MCP server validates, writes Supabase, detects changes, returns notification decision
-> calls send_line_notification MCP tool when decision says to notify
    -> MCP server pushes LINE, records outcome, enforces dedupe
-> writes a run summary to a scratch file (for in-session debugging only)
```

## 591 Search Strategy

The hourly automation uses fixed search groups. The implementation should store these groups in a config file so the agent does not improvise search scope on each run.

These groups are geographic proxies only. The agent must not infer exact commute time, walking time, or transit time in v1.

Search groups:

- Neihu-adjacent group: Neihu, Nangang, Xizhi.
- Environment preference group: Shilin, Zhishan, Mingde, Shipai.
- Exploratory opportunity group: outer Songshan, Dazhi, Jiannan Road.

The exploratory opportunity group is low priority. It exists only to avoid missing unusually good listings and must not be treated as evidence that commute is acceptable.

Hard filters:

- Prefer whole-unit rentals with two bedrooms and one living room.
- Search upper bound is TWD 30,000.
- Do not include listings above TWD 30,000 in candidate notifications.
- Use public 591 search pages and public listing pages only.

Candidate levels:

- `strong`: TWD 25,000 or less, two-bedroom layout, photos and appliances look acceptable.
- `normal`: TWD 25,001 to TWD 28,000, conditions are reasonable.
- `loose`: TWD 28,001 to TWD 30,000, but location, condition, or appliances make the listing worth reviewing.
- `reject`: clearly not a fit, such as not two bedrooms, poor photos, empty unit with missing basic appliances, or above TWD 30,000.

Notification policy:

- Notify `strong`, `normal`, and `loose`.
- Do not notify `reject`.
- Record enough rejected cases in logs during early testing to tune rules, but rejected listings do not need to appear in the triage site unless debugging is enabled.

## Photo And Appliance Review

Every candidate gets `photo_review` and `appliance_review`.

Photo review values:

- `acceptable`: clear indoor photos, normal lighting, clean enough, and basic living condition is visible.
- `needs_review`: too few photos, incomplete angles, insufficient lighting, or unclear room/appliance condition.
- `poor`: obviously dirty, damp, moldy, leaky, extremely dark, severely outdated, heavily cluttered, only exterior/community/floor-plan images, or appears empty without basic equipment.

Required appliance list:

- Air conditioner.
- Refrigerator.
- Washing machine.
- Water heater.

Appliance review values:

- `complete`: all four required appliances are visible in photos or explicitly listed in the description.
- `partial`: some required appliances are visible or described, but others are unknown.
- `missing`: one or more required appliances are clearly absent, or the listing states that basic appliances are not provided.

Decision rules:

- `photo_review = poor` and `appliance_review = missing` means `reject`.
- `photo_review = poor` can still be `loose` only if price or location is unusually good; the LINE message must clearly mark high concern.
- `appliance_review = partial` can still be notified, but the message must list unknown items.
- If photos fail to load, mark `photo_review = needs_review` and notify if the rest of the listing is plausible.

The agent must be explicit when evidence is weak. It should write "needs manual confirmation" rather than pretending to know.

## Data Model

### `listings`

Stores one row per source listing.

Key fields:

- `id`
- `source`
- `source_listing_id`
- `source_url`
- `title`
- `rent_price`
- `district`
- `address_summary`
- `layout`
- `area_ping`
- `floor`
- `raw_snapshot`
- `first_seen_at`
- `last_seen_at`
- `current_status`
- `created_at`
- `updated_at`

Uniqueness:

- Primary dedupe key is `(source, source_listing_id)`.
- Fallback dedupe key is normalized `source_url`.

### `listing_reviews`

Stores each agent review result.

Key fields:

- `id`
- `listing_id`
- `run_id`
- `score_level`
- `photo_review`
- `appliance_review`
- `appliances_seen`
- `appliances_missing_or_unknown`
- `recommendation_reason`
- `concerns`
- `reviewed_at`

### `listing_changes`

Stores important changes worth tracking or notifying.

Key fields:

- `id`
- `listing_id`
- `run_id`
- `change_type`
- `before_snapshot`
- `after_snapshot`
- `change_summary`
- `created_at`

Important change types:

- `new_listing`
- `price_drop`
- `relisted`
- `became_candidate`
- `material_listing_change`
- `review_change`

### `notifications`

Stores LINE notification attempts and dedupe keys.

Key fields:

- `id`
- `listing_id`
- `event_type`
- `event_hash`
- `channel`
- `message_body`
- `status`
- `provider_response`
- `sent_at`
- `created_at`

Deduplication:

- Do not send the same `(listing_id, event_type, event_hash)` twice.
- New listing and important change events have separate event types.

Canonical `event_hash`:

- Compute `event_hash` as `sha256(canonical_json(event_type, source, source_listing_id, normalized_event_payload))`.
- `canonical_json` must sort object keys, remove null-only fields, trim strings, collapse repeated whitespace, and normalize rent prices to integers.
- For `new_listing`, `normalized_event_payload` includes `source_listing_id`, `source_url`, `rent_price`, `district`, `layout`, `area_ping`, `floor`, `score_level`, `photo_review`, and `appliance_review`.
- For `price_drop`, `normalized_event_payload` includes `previous_rent_price`, `current_rent_price`, and `source_listing_id`.
- For `relisted`, `normalized_event_payload` includes `source_listing_id` and the relist observation timestamp rounded to the day.
- For `became_candidate`, `normalized_event_payload` includes previous score level, current score level, `photo_review`, and `appliance_review`.
- For `material_listing_change`, `normalized_event_payload` includes only changed material fields: `rent_price`, `district`, `address_summary`, `layout`, `area_ping`, and `floor`.
- For `review_change`, `normalized_event_payload` includes previous and current `photo_review`, `appliance_review`, `appliances_seen`, and `appliances_missing_or_unknown`.

Ordinary repeats:

- If no canonical event payload changes for a known listing, do not send LINE.
- Title-only changes do not notify unless the title change reflects a material field that also changed in the structured payload.
- Description-only changes do not notify unless they alter `photo_review`, `appliance_review`, score level, or the required-appliance evidence.

### `triage_actions`

Stores user triage state and notes.

Key fields:

- `id`
- `listing_id`
- `status`
- `note`
- `created_at`
- `updated_at`

Allowed statuses:

- `New`
- `Interested`
- `Contacted`
- `Viewing`
- `Rejected`
- `Archived`

## Vercel MCP Server

Hosted at `https://<vercel-app>.vercel.app/api/mcp` using the Streamable HTTP MCP transport.

Authentication:

```text
Authorization: Bearer <AUTOMATION_SECRET>
```

The secret lives in Vercel environment variables and in the runner account's MCP connector config at `claude.ai/settings/connectors`. It is never embedded in the runbook skill, the repo, or the trigger prompt.

### Tool: `upsert_listing`

Input: candidate JSON (see Automation Runbook below).

Behavior:

- Validate input against the shared schema; reject malformed submissions.
- Upsert listing identity (`(source, source_listing_id)` primary key, `source_url` fallback).
- Insert a new row in `listing_reviews` for this run.
- Detect important changes (`new_listing`, `price_drop`, `relisted`, `became_candidate`, `material_listing_change`, `review_change`) by diffing against prior snapshot and review; write matching `listing_changes` rows.
- Compute `event_hash` per the canonical rules and check `notifications` for prior `sent` rows with the same hash.
- Return: `{ should_notify: boolean, event_type: string, event_hash: string, message_body: string }`. `message_body` is the fully-rendered LINE message ready to pass to `send_line_notification`.

### Tool: `get_known_listings`

Input: `{ source: "591", since?: ISO timestamp }`.

Behavior:

- Return recent known listings so the agent can skip unchanged ones. Include: `source_listing_id`, `source_url`, `last_seen_at`, `rent_price`, `current_status`, latest `score_level`, `photo_review`, `appliance_review`.
- Cap at a reasonable size (e.g., 500 most recent) to keep the response small.

### Tool: `send_line_notification`

Input: `{ listing_id, event_type, event_hash, message_body }`.

Behavior:

- Reject if `(listing_id, event_type, event_hash)` already has a `sent` row in `notifications`.
- Call LINE Messaging API push endpoint.
- Record outcome in `notifications` (`status = sent | failed`, plus `provider_response`).
- Return `{ status, notification_id }`.

## Triage Site

The site is hosted on Vercel alongside the MCP server and backed by Supabase.

Authentication:

- v1 uses a single shared password stored as `TRIAGE_PASSWORD` in Vercel environment variables.
- This is intentionally simpler than full auth because the app is personal and low traffic.
- Login is handled server-side. The browser submits the password to a Vercel route, and the route sets a signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookie.
- Session lifetime is seven days.
- Failed login attempts are rate-limited by IP hash using a small Supabase-backed login-attempt table. The login route should throttle after ten failed attempts in fifteen minutes.
- State-changing triage routes require POST and validate the request origin against `NEXT_PUBLIC_SITE_URL` to reduce CSRF risk.
- The browser must never receive `SUPABASE_SERVICE_ROLE_KEY`. In v1, triage reads and writes go through Vercel server components or route handlers.
- The MCP bearer-token endpoint (`/api/mcp`) is distinct from browser-facing routes and does not accept session cookies.

Pages:

```text
/login
```

Password entry.

```text
/
```

Candidate list. It shows only notification-selected listings.
In v1, "candidate list" means listings that were pushed to LINE or had a notification decision returned by the upsert tool. Rejected/debug-only listings are excluded unless a future debug mode is added.

```text
/listings/[id]
```

Listing details, review history, notification history, notes, and original 591 link.

List functionality:

- Filter by triage status.
- Filter by score level.
- Filter by district.
- Sort by latest notification or latest seen time.
- Update status.
- Add or edit note.
- Open original 591 link.

## LINE Notification

Use LINE Messaging API, not LINE Notify.

Required setup:

- Create LINE Official Account.
- Create Messaging API channel.
- Get `LINE_CHANNEL_ACCESS_TOKEN`.
- Get `LINE_USER_ID` after the user adds the Official Account as a friend.
- Store both values in Vercel environment variables.

Trigger rules:

- Send for new candidate listings.
- Send for important changes.
- Do not send ordinary repeated observations.
- Do not send rejected listings.

Important changes:

- Rent price decreases.
- Listing is relisted.
- Listing changes from non-candidate to candidate.
- Layout, ping size, floor, or address summary changes materially.
- Photo or appliance review changes materially.

Message format:

```text
[New Listing] Shilin 2BR TWD 25,000

Rent: TWD 25,000/month
District: Shilin
Layout: 2 bedrooms, 1 living room
Area: 18 ping
Floor: 4F/5F
Level: strong
Photo review: acceptable
Appliance review: partial
Seen: air conditioner, refrigerator
Unknown: washing machine, water heater
Why it is worth checking: price is in range, location fits environment preference, photos look clean
Concerns: bathroom photos are dark; confirm manually
591: <source_url>
Triage: <listing_detail_url>
```

Failure handling:

- If LINE push fails, the listing and review still remain in Supabase.
- The notification row is marked `failed`.
- The next automation run may retry failed notifications via the same MCP tool.
- If token or user ID configuration is wrong, the agent should write the issue to its run summary so the runner account can see it in the trigger output.

## Automation Runbook

The runbook lives in-repo as a Claude Code skill (e.g., `skills/house-search-runbook/SKILL.md`) so the remote trigger can load it via `@skill-name` invocation inside the trigger prompt.

The trigger prompt should be short and delegate to the skill, e.g.:

```text
Run @house-search-runbook. Use the `house-search-mcp` connector for all data writes. Write a run summary when done.
```

The skill instructs the agent to follow these steps every hour:

1. Load the fixed search configuration from `config/search_groups.yaml`.
2. Call `get_known_listings` via the MCP connector to retrieve recently-seen listings for dedupe.
3. `WebFetch` each 591 public search page URL defined in the config.
4. Parse listing IDs and URLs from the search results; skip ones present in `known_listings` with no material change signals.
5. For remaining candidates, `WebFetch` each listing detail page.
6. For each candidate: `Bash curl -o /tmp/<source_listing_id>-<n>.jpg <image_url>` for up to a configured number of photos, then `Read` each file so the multimodal model can judge `photo_review` and `appliance_review`.
7. Apply the score, photo, and appliance rubric.
8. Build candidate JSON matching the schema below.
9. Call `upsert_listing` via the MCP connector.
10. If response `should_notify == true`, call `send_line_notification` with the returned `message_body` and `event_hash`.
11. Append a one-line summary per listing to a run-log scratch file (`run_id`, counts of: seen, submitted, notified, skipped, errors).

Required candidate JSON fields:

```json
{
  "listing_identity": {
    "source": "591",
    "source_listing_id": "string",
    "source_url": "string"
  },
  "title": "string",
  "rent_price": 25000,
  "district": "string",
  "address_summary": "string",
  "layout": "string",
  "area_ping": "number_or_null",
  "floor": "string_or_null",
  "score_level": "strong|normal|loose|reject",
  "photo_review": "acceptable|needs_review|poor",
  "appliance_review": "complete|partial|missing",
  "appliances_seen": ["air_conditioner"],
  "appliances_missing_or_unknown": ["washing_machine"],
  "recommendation_reason": "string",
  "concerns": ["string"],
  "change_type": "new_listing|price_drop|relisted|became_candidate|material_listing_change|review_change|none",
  "should_notify": true
}
```

Note: `change_type` and `should_notify` from the agent are advisory. The `upsert_listing` tool is the source of truth — it recomputes both server-side and returns the authoritative notification decision.

Error handling:

- If a 591 search page cannot be read, do not guess; log the failed search in the run summary and move on to the next group.
- If a listing detail page cannot be read, skip that listing and log it.
- If photos fail to load, mark `photo_review = needs_review`.
- If required identity fields are missing, do not submit the listing.
- If `upsert_listing` returns an error, preserve the candidate JSON in the run summary for next-hour retry.
- If Supabase write succeeds but LINE fails, the listing still shows in triage with a `failed` notification row.

## Environment Variables

Vercel deployment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_USER_ID`
- `AUTOMATION_SECRET`
- `TRIAGE_PASSWORD`
- `NEXT_PUBLIC_SITE_URL`

Runner Claude Code account (one-time setup, not a runtime env var):

- GitHub access established via `/web-setup` (synced `gh` token).
- MCP connector registered at `claude.ai/settings/connectors` with URL `https://<vercel-app>.vercel.app/api/mcp` and bearer token = `AUTOMATION_SECRET`.

Secrets never flow into the repo, the runbook skill, or the trigger prompt.

## Security And Platform Constraints

- The system reads only public 591 pages in v1.
- The system must not bypass login, CAPTCHA, access controls, or platform restrictions.
- FB group automation is excluded from v1 because it depends on login state and platform permissions.
- The agent should use modest request volume because the schedule is hourly and personal-use only.
- Secrets live in Vercel env vars and in the runner account's MCP connector config. Never in the repo, never in the trigger prompt.
- Supabase Row Level Security can be minimal in v1 only if triage reads and writes also go through Vercel server code. If browser-side Supabase access is introduced later, RLS policies must be added before exposing the anon key.
- The MCP endpoint validates the bearer token on every request before dispatching any tool.
- The MCP endpoint rejects cookie-authenticated requests (it's machine-to-machine only).

## Validation Plan

Before enabling hourly automation:

- Run the integration-test harness (calls MCP tools directly against a dev Supabase + test LINE user) with a hand-written fixture candidate.
- Verify Supabase creates listing, review, and notification rows correctly.
- Verify duplicate submission does not create duplicate notification rows.
- Verify an unchanged repeat call creates a new review only if useful for audit, but does not send LINE.
- Verify LINE receives one test notification.
- Verify LINE failure marks notification `failed`, keeps the listing visible in triage, and can be retried.
- Verify the Vercel triage site shows the candidate after notification.
- Verify password protection blocks unauthenticated access to the triage site.
- Verify login throttling activates after repeated failed attempts.
- Verify state-changing triage actions reject requests with an invalid origin.
- Verify a simulated price drop creates an important change notification.
- Verify title-only and description-only noise does not create an important change notification.
- Verify missing identity fields are rejected by `upsert_listing`.
- Verify a photo-load failure becomes `photo_review = needs_review`.
- Verify partial appliance evidence becomes `appliance_review = partial` and lists unknown appliances.
- Verify malformed candidate JSON is rejected by `upsert_listing`.
- Verify the MCP endpoint rejects requests without a valid bearer token.

## Acceptance Criteria

The v1 system is complete when:

- A Vercel-hosted triage site is reachable behind a password.
- A Vercel-hosted MCP server exposes `upsert_listing`, `get_known_listings`, and `send_line_notification` under bearer-token auth.
- Supabase stores listings, reviews, changes, notifications, and triage actions.
- A fixed LINE bot setup can push a full listing summary to the user.
- A Claude Code remote trigger on the runner account can run hourly with the in-repo runbook skill.
- The automation can find at least one test or real 591 candidate, submit it, and show it in the triage site.
- Duplicate runs do not resend unchanged listings.
- New candidates and important changes are sent to LINE.
- Photo and appliance review results appear in both LINE and the triage site.

## Runner Account Handoff

The scheduled trigger runs under a dedicated Claude Code account, not the development account used to build this project. One-time setup on the runner account:

1. Install the GitHub CLI and run `gh auth login` to authenticate locally.
2. In a Claude Code session on the runner account, run `/web-setup` to sync the `gh` token to claude.ai.
3. Verify repo access by opening `https://github.com/alexsui/HouseSearchAutomation` from a Claude Code session on that account.
4. At `claude.ai/settings/connectors`, register a new MCP connector:
   - Name: `house-search-mcp`
   - URL: `https://<vercel-app>.vercel.app/api/mcp`
   - Auth: bearer token = the value of `AUTOMATION_SECRET` from Vercel.
5. In a Claude Code session on the runner account, use the schedule skill (`RemoteTrigger action: create`) to create the trigger:
   - Cron: `0 * * * *` (UTC — hourly is timezone-agnostic).
   - Repo: `https://github.com/alexsui/HouseSearchAutomation`.
   - Model: `claude-sonnet-4-6`.
   - Allowed tools: `Bash`, `Read`, `Write`, `WebFetch`, `Glob`, `Grep`.
   - MCP connection: `house-search-mcp`.
   - Prompt: `Run @house-search-runbook. Use the house-search-mcp connector for all data writes. Write a run summary when done.`
6. Run the trigger once manually (`RemoteTrigger action: run`) to smoke-test. Verify LINE delivery and a new row in `listings`.
7. Enable the trigger for recurring execution.

Secrets stay with the runner account after step 4; the development account never receives `AUTOMATION_SECRET`.

## Risks

- 591 page structure may change, causing extraction failures.
- Public listing photos may not load consistently in the remote trigger environment; image download via `Bash curl` depends on 591 hotlink permissions and network behavior from Anthropic's cloud egress.
- Agent judgment may vary across runs; the fixed rubric and server-side validation in `upsert_listing` reduce but do not eliminate this.
- LINE setup requires one-time manual configuration.
- Vercel and Supabase free tiers are enough for v1, but free-tier limits can change.
- Claude Code scheduled-trigger usage counts against the runner account's plan; hourly × multi-step runs should be monitored during the first week.
- The remote trigger cannot access local files or secrets; all state must live in Supabase or the repo.

## Future Upgrades

- Convert 591 extraction to a deterministic crawler if the agent workflow is unstable.
- Add a Playwright MCP connector if `curl + Read` image analysis becomes insufficient (e.g., if 591 hotlink-blocks image URLs or if rendered content is required).
- Add notification levels: immediate `strong`, digest `normal` and `loose`.
- Add map or transit scoring after core workflow works.
- Add FB group support as a separate second-phase design using manual URL intake or controlled browser-assisted review.
- Add real authentication if the triage site is shared with another person.

## References

- Claude Code — Use Claude Code on the web: https://code.claude.com/docs/en/claude-code-on-the-web
- Claude Support — Using the GitHub Integration: https://support.claude.com/en/articles/10167454-using-the-github-integration
- Claude Code — Scheduled remote agents: https://claude.ai/code/scheduled
- Supabase Pricing: https://supabase.com/pricing
- LINE Messaging API Overview: https://developers.line.biz/en/docs/messaging-api/overview/
