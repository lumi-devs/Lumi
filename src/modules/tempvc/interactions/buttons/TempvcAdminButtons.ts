import type { ButtonInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import { TextInputStyle } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import {
  assertTempvcAdmin,
  removeGenerator,
  renderAdminCard,
} from "#src/modules/tempvc/commands/Tempvc.js";

function parseId(customId: string): { action: string; channelId: string } | null {
  const parts = customId.split(":");
  if (parts[0] !== "tempvc" || parts[1] !== "admin") return null;
  const action = parts[2];
  if (action === "back") return { action, channelId: "" };
  const channelId = parts[3];
  if (!action || !channelId) return null;
  return { action, channelId };
}

export const tempvcAdminButtons = defineInteraction({
  prefix: ["tempvc:admin:name", "tempvc:admin:limit", "tempvc:admin:rm", "tempvc:admin:back"],
  module: "tempvc",
  kinds: ["button"],
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton()) return;
    const guild = interaction.guild;
    if (!guild) return;
    const parsed = parseId(interaction.customId);
    if (!parsed) return;
    if (!(await assertTempvcAdmin(interaction))) return;
    const guildId = guild.id;

    if (parsed.action === "back") {
      await acknowledge(interaction);
      await interaction
        .editReply({ ...(await renderAdminCard(services, guild)) })
        .catch(() => null);
      return;
    }

    if (parsed.action === "rm") {
      await acknowledge(interaction);
      await removeGenerator(services, guildId, parsed.channelId).catch(
        () => false,
      );
      await interaction
        .editReply({ ...(await renderAdminCard(services, guild)) })
        .catch(() => null);
      return;
    }

    if (parsed.action === "name") {
      const modal = new ModalBuilder()
        .setCustomId(`tempvc:admin:name:${parsed.channelId}`)
        .setTitle("Generator Name Template")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("name")
              .setLabel("Template ({username} supported)")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal).catch(() => null);
      return;
    }

    if (parsed.action === "limit") {
      const modal = new ModalBuilder()
        .setCustomId(`tempvc:admin:limit:${parsed.channelId}`)
        .setTitle("Generator User Limit")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("limit")
              .setLabel("User limit (0-99, 0 = unlimited)")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(2)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal).catch(() => null);
    }
  },
});
