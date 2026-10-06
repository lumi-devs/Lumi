import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandlerTypes } from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { LabelBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { TextInputStyle } from "discord.js";
import {
  LumiInteractionHandler,
  LumiStringSelectHandler,
} from "#lib/discord-adapter/LumiInteractionHandler.js";
import { PunishAuthorModalId, PunishAuthorSelectId } from "../../constants.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";

@ApplyOptions<LumiInteractionHandler.Options>({
  name: "punish-author-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
  module: "mod",
})
export class PunishAuthorSelectHandler extends LumiStringSelectHandler<
  { authorId: string }
> {
  public override parse(interaction: StringSelectMenuInteraction) {
    const parsed = PunishAuthorSelectId.parse(interaction.customId);
    if (!parsed) return this.none();
    return this.some(parsed);
  }

  public override async run(
    interaction: StringSelectMenuInteraction,
    { authorId }: { authorId: string },
  ): Promise<void> {
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await isModuleEnabled(guildId, "mod"))) return;

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
      .setCustomId(PunishAuthorModalId.build({ action, authorId }))
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
