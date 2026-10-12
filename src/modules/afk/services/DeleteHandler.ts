import { type Container } from "#src/lib/Services.js";
import { errorCode } from "#src/lib/utilities/Errors.js";
import { coalesceMessageDelete } from "#src/lib/discord/Coalesce.js";
import { clearAfkMentions } from "#src/modules/afk/data/Afk.js";
import type { AfkDeleteMessagePayload } from "#src/modules/afk/tasks/AfkDeleteMessage.js";

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
