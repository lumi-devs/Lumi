import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "@interactions/InteractionDef.js";
import type { Container } from "@lib/Services.js";
import type { BoardKind } from "@modules/leveling/services/LevelService.js";
import {
  parseBoardPage,
  renderBoardMessage,
} from "@modules/leveling/commands/Leaderboard.js";

export async function showBoard(
  services: Container,
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  guildId: string,
  board: BoardKind,
  page: number,
): Promise<void> {
  await acknowledge(interaction);
  try {
    const { files, components, empty } = await renderBoardMessage(
      services,
      guildId,
      board,
      page,
      "#5865F2",
    );
    if (empty) return;
    await interaction.editReply({ files, components }).catch(() => null);
  } catch {
    return;
  }
}

export const levelingBoardButton = defineInteraction({
  prefix: "lvl:lb",
  module: "leveling",
  kinds: ["button"],
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton()) return;
    const guildId = interaction.guildId;
    if (!guildId) return;
    const parsed = parseBoardPage(interaction.customId);
    if (!parsed) return;
    await showBoard(services, interaction, guildId, parsed.board, parsed.page);
  },
});
