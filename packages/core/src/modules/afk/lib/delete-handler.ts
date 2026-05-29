// Worker-side fire handler for the `afk-delete-message` scheduled task.
//
// Reaches Discord via REST (through nirn-proxy when DISCORD_PROXY_URL is set),
// not via `client.channels.cache`. Workers in the gateway/worker split don't
// have a reliable per-guild cache — the REST path is correct under every
// topology.

import { container } from "@sapphire/framework";
import { errorCode } from "#utilities/errors.js";
import { coalesceMessageDelete } from "#core/lib/rest-coalesce.js";
import { clearAfkMentions } from "../data/afk.js";
import type { AfkDeleteMessagePayload } from "../scheduled-tasks/AfkDeleteMessageTask.js";

export async function handleAfkDeleteMessageFire(
  payload: AfkDeleteMessagePayload,
): Promise<void> {
  const { channelId, messageId, clearMentions } = payload;

  // Coalesce per-channel into bulkDelete batches. Bursts of AFK clears in the
  // same channel collapse to ⌈N/100⌉ REST calls instead of N.
  await coalesceMessageDelete(channelId, messageId).catch((err: unknown) => {
    const code = errorCode(err);
    // Unknown message (10008) / unknown channel (10003) / missing access (50001) are expected.
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
