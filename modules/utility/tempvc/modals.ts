import {
  ActionRowBuilder,
  type MessageComponentInteraction,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export interface TextModalOptions {
  customId: string;
  title: string;
  label: string;
  maxLength: number;
  value: string;
}

export async function showTextModal(
  interaction: MessageComponentInteraction,
  options: TextModalOptions,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(options.customId)
    .setTitle(options.title)
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(options.label)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(options.maxLength)
          .setRequired(true)
          .setValue(options.value.slice(0, options.maxLength)),
      ),
    );
  await interaction.showModal(modal).catch(() => undefined);
}
