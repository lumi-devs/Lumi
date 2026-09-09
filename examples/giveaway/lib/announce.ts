import { userMention } from "@discordjs/formatters";
import { ActionRowBuilder, StringSelectMenuBuilder } from "@discordjs/builders";
import * as discord from "lumi/discord";
import { endGiveaway, getGiveaway } from "./store.js";

// The Discord-touching work behind the "giveaway-end" scheduled task. Also
// called directly by /giveaway end for a manual early finish, so both paths
// share one source of truth for "did this giveaway already end".
export async function announceGiveawayEnd(guildId: string, giveawayId: string): Promise<void> {
  const before = await getGiveaway(guildId, giveawayId);
  if (!before || before.endedAt) return;

  const updated = await endGiveaway(guildId, giveawayId);
  if (!updated) return;

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

  const winnersText = updated.winners?.length
    ? updated.winners.map((id) => userMention(id)).join(", ")
    : "No valid entries.";
  const payload = {
    content: `🎉 **Giveaway ended: ${updated.prize}**\nWinners: ${winnersText}`,
    components: [rerollRow.toJSON()],
  };

  const message = await discord.messages.fetch(updated.channelId, updated.messageId);
  if (message) {
    await discord.messages.edit(updated.channelId, updated.messageId, payload);
  } else {
    await discord.channels.send(updated.channelId, payload);
  }
}
