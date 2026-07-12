import { container } from "@sapphire/framework";
import { time, TimestampStyles } from "@discordjs/formatters";
import { getService } from "#lib/module-system/Service.js";
import { makeCard, noPingCard, type CardReply } from "#lib/utilities/cards.js";
import { swallow } from "#lib/utilities/errors.js";

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
  return toggle !== false; // unset counts as the schema default (true)
}

/** Message events in these channels are skipped (e.g. staff/log channels). */
export async function isIgnoredChannel(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const ignored = await getService("config").getConfigList(
    guildId,
    MODULE,
    "ignored_channels",
  );
  return ignored.includes(channelId);
}

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

  const channel =
    container.client.channels.cache.get(channelId) ??
    (await container.client.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;

  const card: CardReply = noPingCard(
    makeCard(color, title, lines.join("\n"), {
      footer: time(new Date(), TimestampStyles.ShortDateTime),
    }),
  );
  await channel.send(card).catch(swallow("Logging: send log card"));
}
