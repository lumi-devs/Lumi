import type { StringSelectMenuInteraction } from "discord.js";
import { LabelBuilder, ModalBuilder, TextInputBuilder } from "@discordjs/builders";
import { TextInputStyle } from "discord.js";
import { defineInteraction } from "#lib/interactions/interaction-def.js";
import { PunishAuthorModalId, PunishAuthorSelectId } from "../../constants.js";
import type { Container } from "#lib/services.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";

export const punishAuthorSelect = defineInteraction({
  prefix: PunishAuthorSelectId.prefix,
  module: "mod",
  async run(services: Container, interaction: StringSelectMenuInteraction): Promise<void> {
    const parsed = PunishAuthorSelectId.parse(interaction.customId);
    if (!parsed) return;
    const { authorId } = parsed;
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await isModuleEnabled(services, guildId, "mod"))) return;

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
  },
});
