import {
  InteractionHandler,
  InteractionHandlerTypes,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { fetchTyped } from "#lib/commands.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { ephemeralCard, makeErrorCard } from "#lib/utilities/cards.js";
import { memberRoleIds } from "#lib/permissions/preconditions/RequirePermit.js";
import { PanicRevertId, buildPanicRevertedCard } from "../lib/panic-card.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "security-panic-revert",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PanicRevertInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (interaction.customId !== PanicRevertId) return this.none();
    return this.some();
  }

  public async run(interaction: ButtonInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    await interaction.deferUpdate();
    const t = await fetchTyped(interaction);

    const hasPermit = await container.permitResolver.hasPermit({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      roleIds: memberRoleIds(interaction.member),
      channelId: interaction.channelId,
      permitNode: "admin.*",
      guildOwnerId: interaction.guild.ownerId,
    });
    if (!hasPermit) {
      return interaction.followUp(
        ephemeralCard(
          makeErrorCard(t(PanelsKeys.PanicDeniedTitle), t(PanelsKeys.PanicDenied)),
        ),
      );
    }

    const result = await getUtility("security").revertPanic(interaction.guild);
    if (!result) {
      return interaction.editReply(
        makeErrorCard(t(PanelsKeys.PanicNotActiveTitle), t(PanelsKeys.PanicNotActive)),
      );
    }

    return interaction.editReply(buildPanicRevertedCard(t, result.restoredCount));
  }
}
