import type { StringSelectMenuInteraction } from "discord.js";
import { defineInteraction } from "@interactions/InteractionDef.js";
import type { Container } from "@lib/Services.js";
import { isBoardKind } from "@modules/leveling/services/LevelService.js";
import { showBoard } from "@modules/leveling/interactions/buttons/LevelButtons.js";

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
    await showBoard(services, interaction, guildId, board, 0);
  },
});
