import { container } from "@sapphire/framework";
import { errorCode } from "#lib/utilities/errors.js";
import { coalesceMessageDelete } from "#lib/rest-coalesce.js";
import { clearAfkMentions } from "../data/afk.js";
import type { AfkDeleteMessagePayload } from "../scheduled-tasks/afkDeleteMessage.js";

export async function handleAfkDeleteMessageFire(
  payload: AfkDeleteMessagePayload,
): Promise<void> {
  const { channelId, messageId, clearMentions } = payload;

  await coalesceMessageDelete(channelId, messageId).catch((err: unknown) => {
    const code = errorCode(err);
    if (code === 10008 || code === 10003 || code === 50001) return;
    container.logger.warn(
      `[AFK] Failed to delete message ${messageId} in ${channelId}:`,
      err,
    );
  });

  if (clearMentions) {
    await clearAfkMentions(clearMentions.guildId, clearMentions.userId).catch(
      (err: unknown) =>
        container.logger.warn("[AFK] Failed to clear mentions:", err),
    );
  }
}
