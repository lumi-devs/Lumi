import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { TextInputStyle, type ButtonInteraction } from "discord.js";

export const EDIT_PRIZE_MODAL_PREFIX = "giveaway:editprizem";

// showModal() must be the interaction's first response - never defer before calling it.
export async function showEditPrizeModal(
  interaction: ButtonInteraction,
  giveawayId: string,
  currentPrize: string,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`${EDIT_PRIZE_MODAL_PREFIX}:${giveawayId}`)
    .setTitle("Edit Prize")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("prize")
          .setLabel("New prize")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setValue(currentPrize)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}
