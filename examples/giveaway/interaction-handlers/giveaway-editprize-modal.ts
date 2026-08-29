import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandler, InteractionHandlerTypes, UserError } from "@sapphire/framework";
import type { ModalSubmitInteraction } from "discord.js";
import { EDIT_PRIZE_MODAL_PREFIX } from "../lib/modals.js";
import { getGiveaway, updateGiveaway } from "../lib/store.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "giveaway-editprize-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export default class GiveawayEditPrizeModalHandler extends InteractionHandler {
  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(`${EDIT_PRIZE_MODAL_PREFIX}:`)) return this.none();
    const giveawayId = interaction.customId.split(":")[2];
    if (!giveawayId) return this.none();
    return this.some({ giveawayId });
  }

  public async run(interaction: ModalSubmitInteraction, { giveawayId }: { giveawayId: string }): Promise<void> {
    if (!interaction.guildId) return;

    const record = await getGiveaway(interaction.guildId, giveawayId);
    if (!record) {
      throw new UserError({ identifier: "GiveawayGone", message: "This giveaway no longer exists." });
    }
    if (interaction.user.id !== record.hostId) {
      throw new UserError({ identifier: "GiveawayNotHost", message: "Only the giveaway host can edit the prize." });
    }
    if (record.endedAt) {
      throw new UserError({ identifier: "GiveawayEnded", message: "This giveaway has already ended." });
    }

    const prize = interaction.fields.getTextInputValue("prize").trim();
    if (!prize) {
      throw new UserError({ identifier: "GiveawayInvalidPrize", message: "The prize can't be empty." });
    }

    await interaction.deferUpdate();
    const updated = await updateGiveaway(interaction.guildId, giveawayId, { prize });
    if (!updated) return;

    const endsAtUnix = Math.floor(updated.endsAt / 1000);
    await interaction.editReply({
      content: `🎉 **${updated.prize}**\nEnds <t:${endsAtUnix}:R> - ${updated.winnerCount} winner${updated.winnerCount === 1 ? "" : "s"}.`,
    });
  }
}
