import type { StringSelectMenuInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import {
  assertTempvcAdmin,
  renderGeneratorCard,
} from "#src/modules/tempvc/commands/Tempvc.js";

export const tempvcAdminManageSelect = defineInteraction({
  prefix: "tempvc:admin:manage",
  module: "tempvc",
  kinds: ["select"],
  async run(
    services: Container,
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;
    const guild = interaction.guild;
    if (!guild) return;
    if (!(await assertTempvcAdmin(interaction))) return;
    await acknowledge(interaction);
    const channelId = interaction.values[0];
    if (!channelId) return;
    await interaction
      .editReply({ ...(await renderGeneratorCard(services, guild, channelId)) })
      .catch(() => null);
  },
});
