import { createMcpHandler } from "mcp-handler";
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
          "Notify via LINE broadcast. Preferred shape: {candidate, event_type, triage_base_url} — server renders the message and dedupes by (source, source_listing_id, event_type, event_hash). Legacy shape: {listing_id, event_type, event_hash, message_body}. Ad-hoc shape: {message_body}.",
        inputSchema: {
          candidate: CandidateSchema.optional(),
          event_type: z.string().min(1).optional(),
          triage_base_url: z.string().url().optional(),
          listing_id: z.string().uuid().optional(),
          event_hash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
          message_body: z.string().min(1).optional(),
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

async function route(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await ctx.params;
  const env = loadServerEnv();
  if (secret !== env.AUTOMATION_SECRET) return new Response(null, { status: 401 });

  const url = new URL(req.url);
  url.pathname = "/api/mcp";
  const rewritten = new Request(url.toString(), req);
  return handler(rewritten);
}

export { route as GET, route as POST };
