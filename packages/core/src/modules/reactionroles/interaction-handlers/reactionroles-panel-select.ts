import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  channelMention,
  type ChannelSelectMenuInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#utilities/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { isReactionRoleMode } from "#modules/reactionroles/data.js";
import { Rr } from "#modules/reactionroles/keys.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";
import { requireManagePermit } from "#modules/reactionroles/lib/panel-guard.js";
import {
  buildMenuDetailCard,
  buildOptionDetailCard,
} from "#modules/reactionroles/ui/panel.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "reactionroles-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class ReactionRolesPanelSelectHandler extends BaseInteractionHandler {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isAnySelectMenu()) return this.none();
    if (!interaction.customId.startsWith(`${Rr}:`)) return this.none();
    const withoutPrefix = interaction.customId.slice(Rr.length + 1);
    if (
      withoutPrefix.startsWith("select:") ||
      withoutPrefix.startsWith("pick:")
    ) {
      return this.none();
    }
    const [action, menuId] = withoutPrefix.split(":");
    if (!action) return this.none();
    if (action !== "menupick" && action !== "optpick" && action !== "modeset" && action !== "postchan") {
      return this.none();
    }
    return this.some({ action, menuId });
  }

  public async run(
    interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction,
    { action, menuId }: { action: string; menuId?: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    await interaction.deferUpdate().catch(() => null);
    await requireManagePermit(interaction);
    if (!(await isModuleEnabled(interaction.guildId, "reactionroles"))) return;
    const guildId = interaction.guildId;
    const t = await fetchTyped(interaction);

    try {
      if (action === "menupick" && interaction.isStringSelectMenu()) {
        const picked = interaction.values[0];
        if (!picked) return;
        const menu = await this.service.getMenu(guildId, picked);
        if (!menu) return;
        await interaction.editReply(buildMenuDetailCard(menu));
        return;
      }
      if (!menuId) return;
      const menu = await this.service.getMenu(guildId, menuId);
      if (!menu) return;

      if (action === "optpick" && interaction.isStringSelectMenu()) {
        const picked = interaction.values[0];
        const option = picked ? menu.options.find((o) => o.id === picked) : undefined;
        if (!option) {
          await interaction.editReply(buildMenuDetailCard(menu));
          return;
        }
        await interaction.editReply(buildOptionDetailCard(menu, option));
        return;
      }
      if (action === "modeset" && interaction.isStringSelectMenu()) {
        const picked = interaction.values[0];
        if (!picked || !isReactionRoleMode(picked)) return;
        const next = await this.service.updateMenu(guildId, menuId, { mode: picked });
        await interaction.editReply(buildMenuDetailCard(next));
        return;
      }
      if (action === "postchan" && interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0];
        const channel = channelId
          ? await interaction.guild!.channels.fetch(channelId).catch(() => null)
          : null;
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
          await interaction.followUp(
            ephemeralCard(
              makeErrorCard(
                t("reactionroles:postChannelTitle"),
                t("reactionroles:postChannelMessage"),
              ),
            ),
          );
          return;
        }
        const { message } = await this.service.postMenu(
          interaction.guild!,
          channel,
          menuId,
        );
        await interaction.editReply(buildMenuDetailCard(menu));
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              t("reactionroles:menuPostedTitle"),
              t("reactionroles:menuPostedMessage", {
                channel: channelMention(channel.id),
                jump: message.url,
              }),
            ),
          ),
        );
      }
    } catch (err: unknown) {
      logError("ReactionRoles: panel select failed", err);
      await interaction
        .followUp(
          ephemeralCard(
            makeErrorCard(
              t("reactionroles:panelFailedTitle"),
              err instanceof Error ? err.message : "Try again.",
            ),
          ),
        )
        .catch(() => null);
    }
  }
}
