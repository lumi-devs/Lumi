import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import { PermitResolver } from "#lib/permissions/index.js";
import { type ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { makeSuccessCard, makeInfoCard } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { scheduleProcessRestart } from "#lib/restart.js";
import { fetchTyped } from "#lib/commands.js";

/**
 * Handles the "Restart Now / Cancel" choice shown after a module update that
 * needs a restart to load (Bun can't hot-swap module code). Restart sends the
 * process a graceful SIGTERM; the supervisor brings it back on the new code.
 */
@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ModuleRestartInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    const restart = interaction.customId.startsWith("module:restart:");
    const cancel = interaction.customId.startsWith("module:restartcancel:");
    if (!restart && !cancel) return this.none();

    const userId = interaction.customId.split(":")[2];
    if (!userId) return this.none();

    return this.some({ action: cancel ? "cancel" : "restart", userId });
  }

  public override async run(
    interaction: ButtonInteraction,
    { action, userId }: { action: "restart" | "cancel"; userId: string },
  ) {
    this.checkSecurity(interaction, userId);
    if (!PermitResolver.isBotOwner(interaction.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.CROSS} Only Bot Owners can restart Lumi.`,
      });
    }
    await this.acknowledge(interaction);
    const t = await fetchTyped(interaction);

    if (action === "cancel") {
      await interaction.editReply(
        makeInfoCard(
          `${Emojis.CROSS} ${t("core:restartCancelledTitle")}`,
          t("core:restartCancelledText"),
        ),
      );
      return;
    }

    await interaction.editReply(
      makeSuccessCard(
        `${Emojis.LOADING} ${t("core:restartingTitle")}`,
        t("core:restartingText"),
      ),
    );
    scheduleProcessRestart(`bot owner ${userId} via update button`);
  }
}
