import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ButtonInteraction,
  GuildMember,
  Interaction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { ReactionRolePickId } from "../constants.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";

@ApplyOptions<ModuleInteractionHandler.Options>({
  name: "reactionroles-pick-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
  module: "reactionroles",
})
export class ReactionRolesPickButtonHandler extends ModuleInteractionHandler<
  ButtonInteraction,
  { menuId: string; optionId: string }
> {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isButton()) return this.none();
    const parsed = ReactionRolePickId.parse(interaction.customId);
    if (!parsed) return this.none();
    return this.some(parsed);
  }

  protected override async handle(
    interaction: ButtonInteraction,
    { menuId, optionId }: { menuId: string; optionId: string },
  ): Promise<void> {
    const { guild } = interaction;
    if (!guild) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    const t = await fetchTyped(interaction);

    const member = interaction.member as GuildMember;
    try {
      const result = await this.service.toggleOption(
        guild,
        member,
        menuId,
        optionId,
      );
      await interaction.editReply(
        result.applied
          ? ephemeralCard(
              makeSuccessCard(
                t("reactionroles:pickAppliedTitle"),
                result.message,
              ),
            )
          : ephemeralCard(
              makeErrorCard(
                t("reactionroles:pickBlockedTitle"),
                result.message,
              ),
            ),
      );
    } catch (err: unknown) {
      logError("ReactionRoles: button pick failed", err);
      await interaction
        .editReply(
          ephemeralCard(
            makeErrorCard(
              t("reactionroles:pickFailedTitle"),
              t("reactionroles:genericFailure"),
            ),
          ),
        )
        .catch(() => null);
    }
  }
}
