import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { config } from "dotenv";
import { getServerClient, resetClientForTests } from "@/services/supabase";
import { loadServerEnv } from "@/config/env";
import { POST } from "@/app/api/mcp/[secret]/route";
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

function mcpRequest(secret: string) {
  return new Request(`http://localhost/api/mcp/${secret}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
}

function routeCtx(secret: string) {
  return { params: Promise.resolve({ secret }) };
}

describe("/api/mcp/[secret] route", () => {
  it("rejects requests with wrong secret", async () => {
    const res = await POST(mcpRequest("wrong-secret"), routeCtx("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("lists the three tools when secret matches", async () => {
    mockFetchOk();
    const secret = process.env.AUTOMATION_SECRET!;
    const res = await POST(mcpRequest(secret), routeCtx(secret));
    expect(res.status).toBe(200);
    const body = parseMcpResponse(await res.text());
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names.sort()).toEqual(
      ["get_known_listings", "send_line_notification", "upsert_listing"].sort(),
    );
  });
});

function parseMcpResponse(raw: string): { result: { tools: Array<{ name: string }> } } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const dataLine = trimmed.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) throw new Error(`unexpected MCP response format: ${trimmed.slice(0, 80)}`);
  return JSON.parse(dataLine.slice("data: ".length));
}
