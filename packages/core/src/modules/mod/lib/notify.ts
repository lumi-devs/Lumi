import type { Guild, User, GuildMember } from "discord.js";
import { makeErrorCard } from "#lib/utilities/cards.js";

/**
 * Send a moderation action DM to a user/member with error card.
 * Silently fails if DMs are closed.
 * Preserves exact message wording per action type.
 *
 * @param target User or GuildMember to send DM to
 * @param emoji Action emoji (e.g., "🔨")
 * @param action Action title for card title (e.g., "Banned")
 * @param guild Guild the action was taken in
 * @param bodyText Full body text for the card (e.g., "You have been banned from...")
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
