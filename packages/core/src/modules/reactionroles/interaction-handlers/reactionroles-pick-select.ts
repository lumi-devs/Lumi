import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  GuildMember,
  Interaction,
  StringSelectMenuInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { ReactionRoleSelectId } from "../constants.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";

@ApplyOptions<ModuleInteractionHandler.Options>({
  name: "reactionroles-pick-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
  module: "reactionroles",
})
export class ReactionRolesPickSelectHandler extends ModuleInteractionHandler<
  StringSelectMenuInteraction,
  { menuId: string }
> {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isStringSelectMenu()) return this.none();
    const parsed = ReactionRoleSelectId.parse(interaction.customId);
    if (!parsed) return this.none();
    return this.some(parsed);
  }

  protected override async handle(
    interaction: StringSelectMenuInteraction,
    { menuId }: { menuId: string },
  ): Promise<void> {
    const { guild } = interaction;
    if (!guild) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    const t = await fetchTyped(interaction);

    const member = interaction.member as GuildMember;
    try {
      const results = await this.service.toggleSelect(
        guild,
        member,
        menuId,
        interaction.values,
      );
      const applied = results.filter((r) => r.applied);
      const blocked = results.find((r) => !r.applied);
      if (applied.length === 0 && blocked) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              t("reactionroles:pickBlockedTitle"),
              blocked.message,
            ),
          ),
        );
        return;
      }
      const lines = [
        ...applied.map((r) => `✅ ${r.message}`),
        ...(blocked ? [`⛔ ${blocked.message}`] : []),
      ];
      await interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            t("reactionroles:pickAppliedTitle"),
            lines.join("\n"),
          ),
        ),
      );
    } catch (err: unknown) {
      logError("ReactionRoles: select pick failed", err);
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
