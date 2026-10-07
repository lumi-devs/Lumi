import { UserError } from "@lumi/shared";
import type { Container } from "#lib/services.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { type ButtonInteraction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import { makeSuccessCard, makeInfoCard } from "#lib/ui/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { scheduleProcessRestart } from "#lib/restart.js";
import { fetchTyped } from "#lib/commands.js";
import { ModuleRestartCancelId, ModuleRestartId } from "../../constants.js";

/**
 * Handles the "Restart Now / Cancel" choice shown after a module update that
 * needs a restart to load (Bun can't hot-swap module code). Restart sends the
 * process a graceful SIGTERM; the supervisor brings it back on the new code.
 */
export const moduleRestart = defineInteraction({
  prefix: [ModuleRestartCancelId.prefix, ModuleRestartId.prefix],
  async run(services: Container, interaction: ButtonInteraction) {
    const cancel = ModuleRestartCancelId.parse(interaction.customId);
    const restart = cancel
      ? null
      : ModuleRestartId.parse(interaction.customId);
    const match = cancel
      ? { action: "cancel" as const, userId: cancel.userId }
      : restart
        ? { action: "restart" as const, userId: restart.userId }
        : null;
    if (!match) return;
    const { action, userId } = match;
    checkSecurity(interaction, userId);
    if (!PermitResolver.isBotOwner(interaction.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.Cross} Only Bot Owners can restart Lumi.`,
      });
    }
    await acknowledge(interaction);
    const t = await fetchTyped(interaction, services);

    if (action === "cancel") {
      await interaction.editReply(
        makeInfoCard(
          `${Emojis.Cross} ${t("core:restartCancelledTitle")}`,
          t("core:restartCancelledText"),
        ),
      );
      return;
    }

    await interaction.editReply(
      makeSuccessCard(
        `${Emojis.Loading} ${t("core:restartingTitle")}`,
        t("core:restartingText"),
      ),
    );
    scheduleProcessRestart(services, `bot owner ${userId} via update button`);
  },
});
