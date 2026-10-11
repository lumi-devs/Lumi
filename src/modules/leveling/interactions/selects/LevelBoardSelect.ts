import type { StringSelectMenuInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import { isBoardKind } from "#src/modules/leveling/services/LevelService.js";
import { renderBoardMessage } from "#src/modules/leveling/commands/Leaderboard.js";

export const levelingBoardSelect = defineInteraction({
  prefix: "lvl:sel",
  module: "leveling",
  kinds: ["select"],
  async run(
    services: Container,
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;
    const guildId = interaction.guildId;
    if (!guildId) return;
    const board = interaction.values[0];
    if (!isBoardKind(board)) return;
    await acknowledge(interaction);
    try {
      const { files, components, empty } = await renderBoardMessage(
        services,
        guildId,
        board,
        0,
        "#5865F2",
      );
      if (empty) return;
      await interaction.editReply({ files, components }).catch(() => null);
    } catch {
      return;
    }
  },
});
