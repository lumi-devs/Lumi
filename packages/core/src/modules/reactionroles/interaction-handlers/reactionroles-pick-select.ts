import {
  InteractionHandler,
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
  name: "reactionroles-pick-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class ReactionRolesPickSelectHandler extends BaseInteractionHandler {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isStringSelectMenu()) return this.none();
    if (!interaction.customId.startsWith(`${Rr}:select:`)) return this.none();
    const [, , menuId] = interaction.customId.split(":");
    if (!menuId) return this.none();
    return this.some({ menuId });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    { menuId }: { menuId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    const t = await fetchTyped(interaction);
    if (!(await isModuleEnabled(interaction.guildId, "reactionroles"))) return;

    const member = interaction.member as GuildMember;
    try {
      const results = await this.service.toggleSelect(
        interaction.guild!,
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
