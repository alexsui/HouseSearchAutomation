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
