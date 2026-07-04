// Shared dispatch for the logging module's listeners: check the event's
// toggle is on and a log channel is set — then send the card (never pinging
// anyone). The module-enabled gate lives in ModuleListener, not here. All
// reads go through the cached config layer, so this is cheap enough to run
// per gateway event.

import { container } from "@sapphire/framework";
import { time, TimestampStyles } from "@discordjs/formatters";
import { parseConfigList } from "#core/module-system/Module.js";
import { makeCard, noPingCard, type CardReply } from "#utilities/cards.js";
import { swallow } from "#utilities/errors.js";

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
  const ignored = parseConfigList(
    await container.db.config.getModuleConfig(
      guildId,
      MODULE,
      "ignored_channels",
    ),
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

  const channel = container.client.channels.cache.get(channelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  const card: CardReply = noPingCard(
    makeCard(color, title, lines.join("\n"), {
      footer: time(new Date(), TimestampStyles.ShortDateTime),
    }),
  );
  await channel.send(card).catch(swallow("Logging: send log card"));
}
