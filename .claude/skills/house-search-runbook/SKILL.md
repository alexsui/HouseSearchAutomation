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
- Local CLI: `agent-browser` (installed at `/Users/samuel/.local/bin/agent-browser`).
  591 is a Vue SPA — cards render client-side — so use `agent-browser` for BOTH
  search listing pages AND detail pages. `WebFetch` will only return the empty
  shell. The agent-browser daemon persists between commands in a run, so
  `agent-browser open … && agent-browser snapshot -i` in sequence is safe.
- `config/search_groups.yaml` defines the fixed search groups.

## Hard rules

1. **Do not improvise scope.** Only visit 591 search pages listed in `config/search_groups.yaml`.
2. **Only public 591 pages.** No login, no 591 favorites, no private messaging, no Facebook groups.
3. **TWD 30,000 ceiling.** Do not submit listings above 30,000 TWD.
4. **Layout filter.** Only 2房1廳 / 2房2廳 (two-bedroom) whole-floor apartments (整層住家).
   Reject 1房1廳, studio / 套房 (獨立套房, 分租套房), and 雅房. If layout is ambiguous, set
   `score_level=reject` and skip notification.
5. **Reject rooftop additions.** If title or description includes 頂樓加蓋 / 頂層加蓋 / rooftop
   addition / illegal-looking roof extension, set `score_level=reject` and add a concern —
   even if the price is attractive.
6. **Xizhi proximity gate.** For any listing in the `xizhi_neihu_border` group, include it
   ONLY if the public listing info (address, nearby-station text, street name) makes it
   clearly very close to the Neihu border (≈500m–1km). If uncertain, reject.
7. **Call MCP tools for every write.** Never write to Supabase or LINE directly.
8. **The MCP response is authoritative.** Your `change_type` and `should_notify` fields in
   the candidate JSON are advisory; use whatever the `upsert_listing` response tells you.
9. **When evidence is weak, say so.** Write "needs manual confirmation" in `concerns` rather
   than pretending to know.
10. **Notify only when worth it.** The upsert response decides, but your `score_level`
    feeds it — don't mark `strong`/`normal`/`loose` for listings you would not personally
    want to look at.

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

- Open the URL with `agent-browser` and wait for the SPA to render. 591 uses
  infinite scroll / pagination — scroll 3–5 times to load a reasonable window
  of cards. Do not try to exhaust every page; ~60 cards per URL is plenty for
  an hourly run.

  ```bash
  # Use a named session so subsequent commands in the run share the same browser.
  agent-browser --session hs open "<search_url>"
  agent-browser --session hs wait --load networkidle
  for i in 1 2 3 4 5 6 7; do
    agent-browser --session hs scroll down 1500 >/dev/null
    agent-browser --session hs wait 800 >/dev/null
  done
  # 591 listing detail URLs are bare-id: https://rent.591.com.tw/<id>.
  # NOT /home/<id> or /rent/<id> — those are unrelated marketing pages.
  agent-browser --session hs eval --stdin <<'EVALEOF'
  JSON.stringify(
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(h => /^https:\/\/rent\.591\.com\.tw\/\d+$/.test(h))
      .filter((h, i, arr) => arr.indexOf(h) === i)
  )
  EVALEOF
  ```

- Extract listing IDs from those URLs (last path segment — the numeric ID).
- For each ID, decide whether to open the detail page:
  - If the listing is absent from `known_listings`, **open it**.
  - If it is present but the `rent_price` differs, or it has been more than 24 hours since
    `last_seen_at`, **open it**.
  - Otherwise **skip** it.

### 4. Open each candidate's detail page

- `agent-browser --session hs open "https://rent.591.com.tw/<id>"` and wait for networkidle.
- Pull the fully-rendered text with `agent-browser get text body` and the photo hrefs
  with an `agent-browser eval` that reads `<img>` / `srcset` / gallery data.
- Extract:
  - `title`
  - `rent_price` (integer TWD)
  - `district` — must match one of the district names in the active group's `districts`
    whitelist (e.g. Neihu, Nangang, Shilin, Beitou, Songshan, plus their station-level
    aliases like Zhishan, Mingde, Shipai, Dazhi, Jiannan). If the listing's district
    falls outside the whitelist, set `score_level=reject` and continue to the next listing.
  - `address_summary` — street or short address text displayed publicly
  - `layout` — 591 uses `2房1廳1衛` style; copy it verbatim
  - `area_ping` — integer or decimal, null if unclear
  - `floor` — `4F/5F` style or null
  - `image_urls` — the listing's photo URLs (up to 10). 591 photo URLs match
    `^https://img[12]\.591\.com\.tw/house/` — use that regex when selecting
    `<img src>` / `srcset` / `data-src` attributes. Once the detail page
    settles at `networkidle`, the first ~5 gallery `<img>` nodes have their
    `src` populated without needing to click the gallery.

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
- `strong`: rent ≤ 25,000 AND 2-bedroom whole-floor AND photos/appliances acceptable.
- `normal`: 25,001 ≤ rent ≤ 28,000, 2-bedroom whole-floor, reasonable condition.
- `loose`: 28,001 ≤ rent ≤ 30,000, 2-bedroom whole-floor, AND there is a clear advantage
  (location sweet spot, photos very good, etc.) — otherwise reject.
- `reject`:
  - not 2-bedroom whole-floor (i.e. 1房1廳, 套房, 雅房, 3房+ split into singles),
  - or title/description mentions 頂樓加蓋 / rooftop addition,
  - or Xizhi without clear Neihu-border proximity,
  - or poor photos AND missing appliances,
  - or above 30,000 TWD.

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
- `triage_base_url`: `https://house-search-automation.vercel.app` (no trailing slash)

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
