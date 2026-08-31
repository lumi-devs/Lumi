import { container } from "@sapphire/framework";
import { getUtility } from "#lib/module-system/Utility.js";
import { queueSend } from "#lib/outbound/send-queue.js";

const MODULE = "logging";

export async function isToggleEnabled(
  guildId: string,
  toggleKey: string,
): Promise<boolean> {
  const toggle = await container.db.config.getModuleConfig(
    guildId,
    MODULE,
    toggleKey,
  );
  return toggle !== false;
}

/** Message events in these channels are skipped (e.g. staff/log channels). */
export async function isIgnoredChannel(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const ignored = await getUtility("config").getConfigList(
    guildId,
    MODULE,
    "ignored_channels",
  );
  return ignored.includes(channelId);
}

/**
 * Queue a log card for the guild's logging channel. Nothing waits on a log
 * card, so it goes through the outbound queue rather than an inline REST call -
 * a rate-limited log channel then parks one queue slot instead of blocking the
 * event handler that produced it.
 */
export async function sendLog(
  guildId: string,
  color: number,
  title: string,
  lines: string[],
): Promise<void> {
  const channelId = await container.db.config.getModuleConfig(
    guildId,
    MODULE,
    "log_channel_id",
  );
  if (!channelId || typeof channelId !== "string") return;

  await queueSend({ channelId, logCard: { color, title, lines } });
}
