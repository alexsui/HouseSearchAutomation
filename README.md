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
