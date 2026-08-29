import { userMention } from "@discordjs/formatters";
import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandler, InteractionHandlerTypes, UserError } from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { getService } from "lumi";
import { getGiveaway, updateGiveaway } from "../lib/store.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "giveaway-reroll",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export default class GiveawayRerollHandler extends InteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith("giveaway:reroll:")) return this.none();
    const giveawayId = interaction.customId.split(":")[2];
    if (!giveawayId) return this.none();
    return this.some({ giveawayId });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    { giveawayId }: { giveawayId: string },
  ): Promise<void> {
    if (!interaction.guildId) return;

    const record = await getGiveaway(interaction.guildId, giveawayId);
    if (!record || !record.endedAt) {
      throw new UserError({ identifier: "GiveawayNotEnded", message: "This giveaway hasn't ended yet." });
    }
    if (interaction.user.id !== record.hostId) {
      throw new UserError({ identifier: "GiveawayNotHost", message: "Only the giveaway host can reroll winners." });
    }

    await interaction.deferUpdate();
    const count = Number.parseInt(interaction.values[0] ?? "1", 10);
    const service = getService("giveaway");
    const winners = await service.pickWinners(interaction.guildId, giveawayId, count);
    const updated = await updateGiveaway(interaction.guildId, giveawayId, { winners });
    if (!updated) return;

    const winnersText = winners.length ? winners.map((id) => userMention(id)).join(", ") : "No valid entries.";
    await interaction.editReply({
      content: `🎉 **Giveaway ended: ${updated.prize}**\nWinners: ${winnersText}`,
    });
  }
}
