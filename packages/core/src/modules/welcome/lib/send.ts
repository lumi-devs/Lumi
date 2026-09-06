import type { Guild } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import type { CardReply } from "#lib/utilities/cards.js";

export async function sendWelcomeCard(
  guild: Guild,
  channelId: string,
  card: CardReply,
  context: string,
): Promise<boolean> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) return false;
  const sent = await channel.send(card).catch((err: unknown) => {
    logError(context, err);
    return null;
  });
  return sent !== null;
}
