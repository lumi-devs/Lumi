import { type Container } from "@lib/Services.js";
import { errorCode } from "@utilities/Errors.js";
import { coalesceMessageDelete } from "@discord/Coalesce.js";
import { clearAfkMentions } from "@modules/afk/data/Afk.js";
import type { AfkDeleteMessagePayload } from "@modules/afk/tasks/AfkDeleteMessage.js";

export async function handleAfkDeleteMessageFire(
  services: Container,
  payload: AfkDeleteMessagePayload,
): Promise<void> {
  const { channelId, messageId, clearMentions } = payload;

  await coalesceMessageDelete(channelId, messageId).catch((err: unknown) => {
    const code = errorCode(err);
    if (code === 10008 || code === 10003 || code === 50001) return;
    services.logger.warn(
      `[AFK] Failed to delete message ${messageId} in ${channelId}:`,
      err,
    );
  });

  if (clearMentions) {
    await clearAfkMentions(services, clearMentions.guildId, clearMentions.userId).catch(
      (err: unknown) =>
        services.logger.warn("[AFK] Failed to clear mentions:", err),
    );
  }
}
