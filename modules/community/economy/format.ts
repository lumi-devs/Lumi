import type { ChatInputCommandInteraction, Guild } from "discord.js";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";

export function formatMoney(symbol: string, amount: bigint | number): string {
  return `${symbol} **${amount.toLocaleString()}**`;
}

export async function requireGuild(
  interaction: ChatInputCommandInteraction,
): Promise<Guild | null> {
  if (interaction.guild) return interaction.guild;

  await interaction.reply(
    ephemeralCard(
      makeErrorCard(
        "Server Only",
        "Economy commands can only be used inside a server.",
      ),
    ),
  );
  return null;
}
