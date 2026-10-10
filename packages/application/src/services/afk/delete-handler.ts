import { type Container } from "@lumi/lib/services.js";
import { errorCode } from "@lumi/lib/utilities/errors.js";
import { coalesceMessageDelete } from "@lumi/lib/discord/coalesce.js";
import { clearAfkMentions } from "@lumi/modules/afk/data/afk.js";
import type { AfkDeleteMessagePayload } from "@lumi/modules/afk/scheduled-tasks/afkDeleteMessage.js";

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
