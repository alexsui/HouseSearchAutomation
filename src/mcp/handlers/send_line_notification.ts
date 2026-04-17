import { pushLineMessage } from "@/services/line";
import {
  hasPriorSentNotification,
  insertNotification,
} from "@/services/repositories/notifications";

export interface SendLineNotificationInput {
  message_body: string;
  listing_id?: string;
  event_type?: string;
  event_hash?: string;
}

export interface SendLineNotificationResult {
  status: "sent" | "failed";
  notification_id: string | null;
}

export async function handleSendLineNotification(
  input: SendLineNotificationInput,
): Promise<SendLineNotificationResult> {
  const integrated =
    !!input.listing_id && !!input.event_type && !!input.event_hash;

  if (integrated) {
    const already = await hasPriorSentNotification(
      input.listing_id!,
      input.event_type!,
      input.event_hash!,
    );
    if (already) {
      throw new Error(
        `notification already sent for listing ${input.listing_id} event ${input.event_type} hash ${input.event_hash!.slice(0, 8)}`,
      );
    }
  }

  const pushResult = await pushLineMessage(input.message_body);

  if (!integrated) {
    return { status: pushResult.status, notification_id: null };
  }

  const row = await insertNotification({
    listing_id: input.listing_id!,
    event_type: input.event_type!,
    event_hash: input.event_hash!,
    message_body: input.message_body,
    status: pushResult.status,
    provider_response: pushResult.response,
  });

  return { status: pushResult.status, notification_id: row.id };
}
