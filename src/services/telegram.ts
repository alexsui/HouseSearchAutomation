import { loadServerEnv } from "@/config/env";

export interface TelegramResult {
  status: "sent" | "failed";
  response: Record<string, unknown>;
}

export async function pushTelegramMessage(text: string): Promise<TelegramResult> {
  const env = loadServerEnv();
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    },
  );

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
