import type { ChatInputCommandInteraction } from "discord.js";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { requireGuildId as guildIdOf } from "@lumi/foundation";

export async function requireGuildId(
  interaction: ChatInputCommandInteraction,
): Promise<string | null> {
  const guildId = guildIdOf(interaction.guildId);
  if (guildId) return guildId;

  await interaction.reply(
    ephemeralCard(
      makeErrorCard(
        "Server Only",
        "Leveling commands can only be used inside a server.",
      ),
    ),
  );
  return null;
}
