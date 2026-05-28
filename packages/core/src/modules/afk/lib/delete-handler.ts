// Worker-side fire handler for the `afk-delete-message` scheduled task.

import { container } from "@sapphire/framework";
import { errorCode } from "#utilities/errors.js";
import { clearAfkMentions } from "../data/afk.js";
import type { AfkDeleteMessagePayload } from "../scheduled-tasks/AfkDeleteMessageTask.js";

export async function handleAfkDeleteMessageFire(
  payload: AfkDeleteMessagePayload,
): Promise<void> {
  const { channelId, messageId, clearMentions } = payload;

  const channel = container.client.channels.cache.get(channelId);
  if (channel?.isTextBased()) {
    await channel.messages.delete(messageId).catch((err: unknown) => {
      const code = errorCode(err);
      // Unknown message (10008) or unknown channel (10003) are expected — ignore.
      if (code === 10008 || code === 10003) return;
      container.logger.warn(
        `[AFK] Failed to delete message ${messageId} in ${channelId}:`,
        err,
      );
    });
  }

  if (clearMentions) {
    await clearAfkMentions(clearMentions.guildId, clearMentions.userId).catch(
      (err: unknown) =>
        container.logger.warn("[AFK] Failed to clear mentions:", err),
    );
  }
}
