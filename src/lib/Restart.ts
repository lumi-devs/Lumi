import type { Container } from "#src/lib/Services.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import {
  ModuleRestartCancelId,
  ModuleRestartId,
} from "#src/modules/core/Constants.js";

export function restartChoiceRow(
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ModuleRestartId.build({ userId }))
      .setLabel("Restart Now")
      .setStyle(ButtonStyle.Danger)
      .setEmoji({ name: "🔄" }),
    new ButtonBuilder()
      .setCustomId(ModuleRestartCancelId.build({ userId }))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

let restartScheduled = false;
let restartRequested = false;

export function consumeRestartRequested(): boolean {
  const requested = restartRequested;
  restartRequested = false;
  return requested;
}

export function scheduleProcessRestart(services: Container, reason: string, delayMs = 2_000): void {
  if (restartScheduled) return;
  restartScheduled = true;
  restartRequested = true;

  services.logger.warn(
    `[Restart] Scheduling graceful restart in ${delayMs}ms - ${reason}`,
  );

  const timer = setTimeout(() => {
    services.logger.warn(
      `[Restart] Sending SIGTERM to self (pid ${process.pid})`,
    );
    process.kill(process.pid, "SIGTERM");
  }, delayMs);
  timer.unref?.();
}
