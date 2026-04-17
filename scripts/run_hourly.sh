#!/usr/bin/env bash
# Local hourly runner for the house-search agent.
# Invoked by launchd (~/Library/LaunchAgents/com.samuel.house-search.plist).
# Cloud Routines are blocked by Anthropic's egress proxy (host_not_allowed),
# so this runs from the user's Mac — residential IP, no proxy.
set -euo pipefail

REPO_DIR="/Users/samuel/Developer/house-search"
CLAUDE_BIN="/Users/samuel/.superset/bin/claude"
LOG_DIR="$HOME/Library/Logs/house-search"
mkdir -p "$LOG_DIR"

cd "$REPO_DIR"

# Load secrets (.env is gitignored; contains AUTOMATION_SECRET etc.)
set -a
# shellcheck disable=SC1091
source .env
set +a

RUN_ID="run-$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG="$LOG_DIR/$RUN_ID.log"

{
  echo "=== house-search $RUN_ID ==="
  date -u

  # Stay in sync with main so runbook/config changes take effect without a manual pull.
  git fetch --quiet origin main && git pull --ff-only --quiet origin main || echo "git pull failed; continuing with current worktree"

  "$CLAUDE_BIN" \
    --print \
    --permission-mode dontAsk \
    --allowedTools "Bash(git:*) Bash(curl:*) Bash(mkdir:*) Bash(cd:*) Bash(cat:*) Bash(ls:*) Bash(date:*) WebFetch Read Write Glob Grep Skill mcp__house-search-mcp__get_known_listings mcp__house-search-mcp__upsert_listing mcp__house-search-mcp__send_line_notification" \
    "Run the house-search hourly automation now. Follow .claude/skills/house-search-runbook/SKILL.md end-to-end. The house-search-mcp MCP server is already registered via .mcp.json; call the MCP tools (get_known_listings, upsert_listing, send_line_notification) directly as MCP tools. Use run_id=$RUN_ID and triage_base_url=https://house-search-automation.vercel.app. Begin by invoking the house-search-runbook skill."

  echo "=== done $(date -u) ==="
} >>"$LOG" 2>&1
