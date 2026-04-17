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
