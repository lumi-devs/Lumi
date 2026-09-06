import {
  InteractionHandler,
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
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { Rr } from "#modules/reactionroles/keys.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "reactionroles-pick-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ReactionRolesPickButtonHandler extends BaseInteractionHandler {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isButton()) return this.none();
    if (!interaction.customId.startsWith(`${Rr}:pick:`)) return this.none();
    const [, , menuId, optionId] = interaction.customId.split(":");
    if (!menuId || !optionId) return this.none();
    return this.some({ menuId, optionId });
  }

  public async run(
    interaction: ButtonInteraction,
    { menuId, optionId }: { menuId: string; optionId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    const t = await fetchTyped(interaction);
    if (!(await isModuleEnabled(interaction.guildId, "reactionroles"))) return;

    const member = interaction.member as GuildMember;
    try {
      const result = await this.service.toggleOption(
        interaction.guild!,
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
