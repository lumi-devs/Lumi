import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { LabelBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { TextInputStyle } from "discord.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { PunishAuthorSelectPrefix } from "../commands/punish-author.js";

export const PunishAuthorModalPrefix = "modqp:modal";

@ApplyOptions<InteractionHandler.Options>({
  name: "punish-author-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class PunishAuthorSelectHandler extends InteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith(`${PunishAuthorSelectPrefix}:`)) {
      return this.none();
    }
    const authorId = interaction.customId.split(":")[2];
    if (!authorId) return this.none();
    return this.some({ authorId });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    { authorId }: { authorId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    if (!(await isModuleEnabled(interaction.guildId, "mod"))) return;

    const action = interaction.values[0];
    if (!action) return;

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("Reason (optional)");
    const reasonLabel = new LabelBuilder()
      .setLabel("Reason")
      .setTextInputComponent(reasonInput);

    const modal = new ModalBuilder()
      .setCustomId(`${PunishAuthorModalPrefix}:${action}:${authorId}`)
      .setTitle(`Punish: ${action}`)
      .addLabelComponents(reasonLabel);

    if (action === "timeout") {
      const durationInput = new TextInputBuilder()
        .setCustomId("duration")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("e.g. 10m, 1h, 1d")
        .setValue("10m");
      const durationLabel = new LabelBuilder()
        .setLabel("Duration")
        .setTextInputComponent(durationInput);
      modal.addLabelComponents(durationLabel);
    }

    await interaction.showModal(modal);
  }
}
