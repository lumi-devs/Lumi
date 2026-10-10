import { ButtonInteraction, MessageFlags } from "discord.js";
import { defineInteraction } from "@lumi/lib/interactions/interaction-def.js";
import type { Container } from "@lumi/lib/services.js";
import { handleMediaRequest } from "@lumi/application/services/utility/media-utils.js";
import { UserMediaViewId } from "../../constants.js";

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
