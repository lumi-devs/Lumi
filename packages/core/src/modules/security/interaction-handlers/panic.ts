import {
  InteractionHandlerTypes,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { ButtonInteraction } from "discord.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { fetchTyped } from "#lib/commands.js";
import { revertPanic } from "../services/panic.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { ephemeralCard, makeErrorCard } from "#lib/ui/cards.js";
import { memberRoleIds } from "#lib/permissions/subject.js";
import { PanicRevertId, buildPanicRevertedCard } from "../ui/panic-card.js";

@ApplyOptions<ModuleInteractionHandler.Options>({
  name: "security-panic-revert",
  interactionHandlerType: InteractionHandlerTypes.Button,
  module: "security",
})
export class PanicRevertInteractionHandler extends ModuleInteractionHandler<
  ButtonInteraction,
  undefined
> {
  public override parse(interaction: ButtonInteraction) {
    if (interaction.customId !== PanicRevertId) return this.none();
    return this.some();
  }

  protected override async handle(interaction: ButtonInteraction) {
    const { guild } = interaction;
    if (!guild) return;
    await this.acknowledge(interaction);
    const t = await fetchTyped(interaction);

    const hasPermit = await container.permitResolver.hasPermit({
      guildId: guild.id,
      userId: interaction.user.id,
      roleIds: memberRoleIds(interaction.member),
      channelId: interaction.channelId,
      permitNode: "admin.*",
      guildOwnerId: guild.ownerId,
    });
    if (!hasPermit) {
      await interaction.followUp(
        ephemeralCard(
          makeErrorCard(t(PanelsKeys.PanicDeniedTitle), t(PanelsKeys.PanicDenied)),
        ),
      );
      return;
    }

    const result = await revertPanic(guild);
    if (!result) {
      await interaction.editReply(
        makeErrorCard(t(PanelsKeys.PanicNotActiveTitle), t(PanelsKeys.PanicNotActive)),
      );
      return;
    }

    await interaction.editReply(buildPanicRevertedCard(t, result.restoredCount));
  }
}
