import {
  buildSafeActionRows,
  createActionButton,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";

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
