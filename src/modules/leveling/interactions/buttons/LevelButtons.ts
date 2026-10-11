import type { ButtonInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import type { BoardKind } from "#src/modules/leveling/services/LevelService.js";
import {
  parseBoardPage,
  renderBoardMessage,
} from "#src/modules/leveling/commands/Leaderboard.js";

export async function showBoard(
  services: Container,
  interaction: ButtonInteraction,
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
