import type {
  GuildMember,
  StringSelectMenuInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { fetchTyped } from "#lib/i18n/index.js";
import { defineInteraction } from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { ReactionRoleSelectId } from "../../constants.js";
import type { ReactionRolesUtility } from "#modules/reactionroles/utilities/ReactionRolesUtility.js";

export const reactionrolesPickSelect = defineInteraction({
  prefix: ReactionRoleSelectId.prefix,
  module: "reactionroles",
  async run(_services: Container, interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;
    const parsed = ReactionRoleSelectId.parse(interaction.customId);
    if (!parsed) return;
    const { menuId } = parsed;
    const service: ReactionRolesUtility = getUtility("reactionroles");
    const { guild } = interaction;
    if (!guild) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    const t = await fetchTyped(interaction);

    const member = interaction.member as GuildMember;
    try {
      const results = await service.toggleSelect(
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
  },
});
