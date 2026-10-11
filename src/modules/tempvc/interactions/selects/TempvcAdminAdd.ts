import type { ChannelSelectMenuInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import { makeErrorCard } from "#src/lib/ui/Cards.js";
import {
  addGenerator,
  renderAdminCard,
} from "#src/modules/tempvc/commands/Tempvc.js";

export const tempvcAdminAddSelect = defineInteraction({
  prefix: "tempvc:admin:add",
  module: "tempvc",
  kinds: ["select"],
  async run(
    services: Container,
    interaction: ChannelSelectMenuInteraction,
  ): Promise<void> {
    if (!interaction.isChannelSelectMenu()) return;
    const guild = interaction.guild;
    if (!guild) return;
    await acknowledge(interaction);
    const channelId = interaction.values[0];
    if (!channelId) return;
    const result = await addGenerator(services, guild, channelId);
    if (!result.ok) {
      await interaction
        .editReply({ ...makeErrorCard("Cannot Add Generator", result.message) })
        .catch(() => null);
      return;
    }
    await interaction
      .editReply({ ...(await renderAdminCard(services, guild)) })
      .catch(() => null);
  },
});
