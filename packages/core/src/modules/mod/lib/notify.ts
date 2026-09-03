import type { Guild, User, GuildMember } from "discord.js";
import { makeErrorCard } from "#lib/utilities/cards.js";

/**
 * Sends a moderation action DM to a user/member. Silently fails if DMs are closed.
 */
export async function sendModActionDm(
  target: User | GuildMember,
  emoji: string,
  action: string,
  guild: Guild,
  bodyText: string,
): Promise<void> {
  const user = "user" in target ? target.user : target;
  const dm = makeErrorCard(
    `${emoji} ${action} - ${guild.name}`,
    bodyText,
  );
  await user.send(dm).catch(() => null);
}
