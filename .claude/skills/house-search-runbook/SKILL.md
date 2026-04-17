---
name: house-search-runbook
description: |
  Use for the scheduled house-search automation. Reads fixed 591 search groups from
  config/search_groups.yaml, evaluates new or changed listings against the photo/appliance
  rubric, and pushes qualifying candidates directly to LINE via the single
  `send_line_notification` MCP tool. Server dedupes repeats per (source_listing_id,
  event_type, event_hash) so the agent can fire without tracking state.
---

# House Search Runbook

You are the scheduled hourly agent for a personal Taipei rental search. You read public
591 pages, judge listing photos and descriptions, and notify the user via LINE. The only
MCP tool you need is `send_line_notification` — the server handles rendering, dedup, and
delivery.

## Inputs you can rely on

- The repo is cloned and the current working directory is the repo root.
- MCP tool: `send_line_notification`. Preferred input shape:
  ```json
  {
    "candidate": { /* full Candidate JSON, see step 7 */ },
    "event_type": "new_listing",
    "triage_base_url": "https://house-search-automation.vercel.app"
  }
  ```
  The server renders the LINE message, dedupes by (source, source_listing_id, event_type,
  event_hash), and broadcasts. Response: `{status: "sent" | "failed" | "already_sent",
  notification_id: <uuid|null>}`. If `already_sent` or `failed`, move on — don't retry.
- Built-in tools: `Bash`, `Read`, `Glob`, `Grep`, `Write` (WebFetch is unused — 591 is a SPA).
- Local CLI: `agent-browser` at `/Users/samuel/.local/bin/agent-browser`. Used for both
  search listing pages and detail pages.
- `config/search_groups.yaml` defines the fixed search groups.

## Hard rules

1. **Do not improvise scope.** Only visit 591 search pages listed in `config/search_groups.yaml`.
2. **Only public 591 pages.** No login, no 591 favorites, no private messaging, no Facebook groups.
3. **TWD 30,000 ceiling.** Do not notify listings above 30,000 TWD.
4. **Layout filter.** Only 2房1廳 / 2房2廳 (two-bedroom) whole-floor apartments (整層住家).
   Reject 1房1廳, studio / 套房 (獨立套房, 分租套房), and 雅房. If layout is ambiguous, set
   `score_level=reject` and don't notify.
5. **Reject rooftop additions.** If title or description includes 頂樓加蓋 / 頂層加蓋 / rooftop
   addition / illegal-looking roof extension, set `score_level=reject` — even if the price
   is attractive.
6. **Xizhi proximity gate.** For any listing in a Xizhi-targeted group, include it ONLY if
   the public listing info (address, nearby-station text, street name) makes it clearly very
   close to the Neihu border (≈500m–1km). If uncertain, reject.
7. **Call MCP for every LINE notification.** Never push to LINE directly.
8. **Trust the server's dedup.** If `send_line_notification` returns `already_sent`, the
   server has already notified for this (source_listing_id, event_type, event_hash) combo.
9. **When evidence is weak, say so.** Write "needs manual confirmation" in `concerns` rather
   than pretending to know.

## Step-by-step procedure

### 1. Load configuration

```bash
cat config/search_groups.yaml
```

Parse the groups mentally. Note each group's `name`, `search_urls`, and `districts`.

### 2. For each search URL: scrape and list candidate IDs

591 is a Vue SPA — cards render client-side. Use agent-browser.

```bash
agent-browser --session hs open "<search_url>"
agent-browser --session hs wait --load networkidle
for i in 1 2 3 4 5 6 7; do
  agent-browser --session hs scroll down 1500 >/dev/null
  agent-browser --session hs wait 800 >/dev/null
done
agent-browser --session hs eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll('a[href]'))
    .map(a => a.href)
    .filter(h => /^https:\/\/rent\.591\.com\.tw\/\d+$/.test(h))
    .filter((h, i, arr) => arr.indexOf(h) === i)
)
EVALEOF
```

591 listing detail URLs are bare-id: `https://rent.591.com.tw/<id>`. NOT `/home/<id>` or
`/rent/<id>` — those are unrelated marketing pages.

You don't need a local dedup step. Every listing goes through the pipeline; the server
dedupes at the notify boundary. That does mean you open each detail page once per run —
that's fine hourly.

### 3. For each listing: open detail page and extract fields

```bash
agent-browser --session hs open "https://rent.591.com.tw/<id>"
agent-browser --session hs wait --load networkidle
agent-browser --session hs get text body   # structured listing content
```

Extract:
- `title`
- `rent_price` (integer TWD)
- `district` — must match one of the whitelisted district/station names (Neihu, Nangang,
  Shilin, Beitou, Songshan, Zhishan, Mingde, Shipai, Dazhi, Jiannan, Xizhi). Outside the
  whitelist → set `score_level=reject` and skip.
- `address_summary` — street or short address text displayed publicly.
- `layout` — 591 uses `2房1廳1衛` style; copy it verbatim.
- `area_ping` — integer or decimal, null if unclear.
- `floor` — `4F/5F` style or null.
- `image_urls` — up to 10 photo URLs. 591 photo URLs match
  `^https://img[12]\.591\.com\.tw/house/`. Select `<img src>` / `srcset` / `data-src`
  attrs whose URL matches that prefix. After `networkidle`, the first ~5 gallery `<img>`
  nodes have their `src` populated without clicking.

### 4. Download and inspect photos

Up to 6 photos per listing.

```bash
mkdir -p /tmp/house_search_run_$RUN_ID
cd /tmp/house_search_run_$RUN_ID
curl -sS -L -o "<source_listing_id>-1.jpg" "<image_url_1>" -H "referer: https://rent.591.com.tw/"
# repeat for each image
```

Then `Read` each downloaded file so the image lands in context and you can actually look at it.

If any image fails to download: note in `concerns` and continue. If **all** images fail,
set `photo_review = needs_review`.

### 5. Apply the rubric

Photo review:
- `acceptable`: clear indoor photos, normal lighting, clean enough, basic living condition visible.
- `needs_review`: too few photos, incomplete angles, insufficient lighting, unclear rooms.
- `poor`: dirty, damp, moldy, leaky, very dark, severely outdated, heavily cluttered,
  only exterior/floor-plan images, or empty without basic equipment.

Required appliances: air_conditioner, refrigerator, washing_machine, water_heater.

Appliance review:
- `complete`: all four visible in photos or explicitly listed in the description.
- `partial`: some visible or described; others unknown.
- `missing`: one or more clearly absent OR the listing states "no basic appliances".

Score level:
- `strong`: rent ≤ 25,000 AND 2-bedroom whole-floor AND photos/appliances acceptable.
- `normal`: 25,001–28,000, 2-bedroom whole-floor, reasonable condition.
- `loose`: 28,001–30,000, 2-bedroom whole-floor, AND a clear advantage.
- `reject`: any hard-rule violation, not 2-bedroom whole-floor, rooftop addition, Xizhi
  without Neihu-border proximity, poor photos AND missing appliances, or above 30,000 TWD.

If `score_level=reject`: skip the notify call entirely, move to the next listing.

### 6. Build the Candidate JSON

```json
{
  "listing_identity": {
    "source": "591",
    "source_listing_id": "<id>",
    "source_url": "https://rent.591.com.tw/<id>"
  },
  "title": "<title>",
  "rent_price": <int>,
  "district": "<district>",
  "address_summary": "<address>",
  "layout": "<layout>",
  "area_ping": <number or null>,
  "floor": "<string or null>",
  "score_level": "strong|normal|loose",
  "photo_review": "acceptable|needs_review|poor",
  "appliance_review": "complete|partial|missing",
  "appliances_seen": ["air_conditioner", ...],
  "appliances_missing_or_unknown": ["washing_machine", ...],
  "recommendation_reason": "<one short sentence on why it matched>",
  "concerns": ["<short concern>", "..."],
  "change_type": "new_listing",
  "should_notify": true
}
```

`change_type` is advisory to the dedup hash — leave it `"new_listing"` unless you're
explicitly tracking a `price_drop` or similar.

### 7. Notify via MCP

```
send_line_notification({
  "candidate": <the JSON from step 6>,
  "event_type": "new_listing",
  "triage_base_url": "https://house-search-automation.vercel.app"
})
```

Response:
- `{status: "sent"}` → LINE got the message, logged. You're done with this listing.
- `{status: "already_sent"}` → server already notified for this combo; silently move on.
- `{status: "failed"}` → LINE API rejected; logged as failed server-side. Move on — don't retry.

### 8. Run summary

At the end of the run, `Write` a run summary at `/tmp/run_summary.md` and print it:

```
run_id: run-2026-04-17T14:00Z
search_url_1: fetched=28 processed=28 notified=3 already_sent=22 rejected=3 errors=0
failed_searches: []
failed_details: []
```

Close the agent-browser session when done: `agent-browser --session hs close`.

## What not to do

- Do not invent listings. If you cannot extract a required field, skip the listing.
- Do not push to LINE outside `send_line_notification`.
- Do not write anywhere on disk except `/tmp/`.
- Do not fetch anything outside 591's public pages and the `img[12].591.com.tw/house/` image CDN.
- Do not retry a failed MCP call more than once within the same run.
- Do not notify for `score_level=reject` — just skip.
