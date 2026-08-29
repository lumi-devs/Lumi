import { userMention } from "@discordjs/formatters";
import { container } from "@sapphire/framework";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getService } from "lumi";
import { getGiveaway } from "./store.js";

// The actual Discord-touching work behind the "giveaway-end" scheduled task.
// Also called directly by /giveaway end for a manual early finish, so both
// paths share one implementation and one source of truth for "did this
// giveaway already end".
export async function announceGiveawayEnd(guildId: string, giveawayId: string): Promise<void> {
  const before = await getGiveaway(guildId, giveawayId);
  if (!before || before.endedAt) return;

  const service = getService("giveaway");
  const updated = await service.end(guildId, giveawayId);
  if (!updated) return;

  const guild = await container.client.guilds.fetch(guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(updated.channelId).catch(() => null) : null;
  if (!channel?.isTextBased()) return;

  const winnersText = updated.winners?.length
    ? updated.winners.map((id) => userMention(id)).join(", ")
    : "No valid entries.";

  const rerollRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`giveaway:reroll:${giveawayId}`)
      .setPlaceholder("Reroll winners (host only)")
      .addOptions(
        { label: "Reroll 1 winner", value: "1" },
        { label: "Reroll 2 winners", value: "2" },
        { label: "Reroll 3 winners", value: "3" },
      ),
  );

  const content = `🎉 **Giveaway ended: ${updated.prize}**\nWinners: ${winnersText}`;
  const message = await channel.messages.fetch(updated.messageId).catch(() => null);

  if (message) {
    await message.edit({ content, components: [rerollRow] }).catch(() => null);
  } else {
    await channel.send({ content, components: [rerollRow] }).catch(() => null);
  }
}
