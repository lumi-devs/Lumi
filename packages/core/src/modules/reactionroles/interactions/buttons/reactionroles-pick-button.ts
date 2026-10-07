import type {
  ButtonInteraction,
  GuildMember,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { defineInteraction } from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { ReactionRolePickId } from "../../constants.js";
import type { ReactionRolesUtility } from "#modules/reactionroles/utilities/ReactionRolesUtility.js";

export const reactionrolesPickButton = defineInteraction({
  prefix: ReactionRolePickId.prefix,
  module: "reactionroles",
  async run(_services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton()) return;
    const parsed = ReactionRolePickId.parse(interaction.customId);
    if (!parsed) return;
    const { menuId, optionId } = parsed;
    const service: ReactionRolesUtility = getUtility("reactionroles");
    const { guild } = interaction;
    if (!guild) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    const t = await fetchTyped(interaction);

    const member = interaction.member as GuildMember;
    try {
      const result = await service.toggleOption(
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
  },
});
