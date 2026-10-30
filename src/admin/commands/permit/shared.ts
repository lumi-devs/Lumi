import {
  buildSafeActionRows,
  createActionButton,
  ephemeralCard,
  makeErrorCard,
  row,
} from "@lumi/ui";
import { ButtonStyle, type ChatInputCommandInteraction } from "discord.js";


export async function replyPermitError(
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
): Promise<void> {
  await interaction.reply(ephemeralCard(makeErrorCard(title, body)));
}

export function openPermitsRow() {
  return buildSafeActionRows([
    row(
      createActionButton({
        customId: "lumi:permitpanel",
        label: "Open Permits",
        style: ButtonStyle.Primary,
        emoji: "🛡️",
      }),
    ),
  ]);
}
