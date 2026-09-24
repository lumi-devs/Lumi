import { ActionRowBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { TextInputStyle } from "discord-api-types/v10";

export const EDIT_PRIZE_MODAL_PREFIX = "giveaway:editprizem";

export function editPrizeModal(giveawayId: string, currentPrize: string): ModalBuilder {
  return new ModalBuilder()
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
}
