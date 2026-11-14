import { ButtonInteraction, MessageFlags } from "discord.js";
import { defineInteraction } from "@interactions/InteractionDef.js";
import type { Container } from "@lib/Services.js";
import { handleMediaRequest } from "@modules/utility/services/MediaUtils.js";
import { UserMediaViewId } from "@modules/utility/Constants.js";

export default defineInteraction({
  prefix: UserMediaViewId.prefix,
  module: "utility",
  async run(services: Container, interaction: ButtonInteraction) {
    const parsed = UserMediaViewId.parse(interaction.customId);
    if (!parsed) return;
    const { userId, type } = parsed;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    await handleMediaRequest({
      context: interaction,
      targetUser: await interaction.client.users.fetch(userId),
      mediaType: type as "avatar" | "banner",
      container: services,
    });
  },
});
