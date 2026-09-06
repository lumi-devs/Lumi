import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ButtonInteraction,
  Interaction,
} from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { Rr } from "#modules/reactionroles/keys.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";
import { requireManagePermit } from "#modules/reactionroles/lib/panel-guard.js";
import {
  buildDeleteConfirmCard,
  buildMaxRolesModal,
  buildMenuDetailCard,
  buildMenuEditModal,
  buildMenuListCard,
  buildNewMenuModal,
  buildOptionModal,
  buildOptionRemoveConfirmCard,
} from "#modules/reactionroles/ui/panel.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "reactionroles-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ReactionRolesPanelButtonHandler extends BaseInteractionHandler {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isButton()) return this.none();
    if (!interaction.customId.startsWith(`${Rr}:`)) return this.none();
    if (
      interaction.customId.startsWith(`${Rr}:pick:`) ||
      interaction.customId.startsWith(`${Rr}:select:`)
    ) {
      return this.none();
    }
    const parts = interaction.customId.split(":");
    const action = parts[1];
    const menuId = parts[2];
    const optionId = parts[3];
    if (!action) return this.none();
    return this.some({ action, menuId, optionId });
  }

  public async run(
    interaction: ButtonInteraction,
    {
      action,
      menuId,
      optionId,
    }: { action: string; menuId?: string; optionId?: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;

    const opensModal =
      action === "new" ||
      action === "optadd" ||
      action === "optedit" ||
      action === "menuedit" ||
      action === "maxroles";
    if (!opensModal) await interaction.deferUpdate().catch(() => null);

    await requireManagePermit(interaction);
    if (!(await isModuleEnabled(interaction.guildId, "reactionroles"))) return;
    const guildId = interaction.guildId;

    try {
      switch (action) {
        case "new":
          await interaction.showModal(buildNewMenuModal());
          return;
        case "list": {
          const menus = await this.service.listMenus(guildId);
          await interaction.editReply(buildMenuListCard(menus));
          return;
        }
        case "backmenu":
        case "refresh": {
          if (!menuId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          if (!menu) return this.#menuGone(interaction);
          await interaction.editReply(buildMenuDetailCard(menu));
          return;
        }
        case "optadd": {
          if (!menuId) return;
          await interaction.showModal(buildOptionModal(menuId));
          return;
        }
        case "optedit": {
          if (!menuId || !optionId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          const option = menu?.options.find((o) => o.id === optionId);
          if (!menu || !option) return this.#menuGone(interaction);
          await interaction.showModal(buildOptionModal(menuId, option));
          return;
        }
        case "optremove": {
          if (!menuId || !optionId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          const option = menu?.options.find((o) => o.id === optionId);
          if (!menu || !option) return this.#menuGone(interaction);
          await interaction.editReply(buildOptionRemoveConfirmCard(menu, option));
          return;
        }
        case "optremoveyes": {
          if (!menuId || !optionId) return;
          const menu = await this.service.removeOption(guildId, menuId, optionId);
          await interaction.editReply(buildMenuDetailCard(menu));
          return;
        }
        case "menuedit": {
          if (!menuId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          if (!menu) return this.#menuGone(interaction);
          await interaction.showModal(buildMenuEditModal(menu));
          return;
        }
        case "maxroles": {
          if (!menuId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          if (!menu) return this.#menuGone(interaction);
          await interaction.showModal(buildMaxRolesModal(menu));
          return;
        }
        case "excl": {
          if (!menuId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          if (!menu) return this.#menuGone(interaction);
          const next = await this.service.updateMenu(guildId, menuId, {
            exclusive: !menu.exclusive,
          });
          await interaction.editReply(buildMenuDetailCard(next));
          return;
        }
        case "del": {
          if (!menuId) return;
          const menu = await this.service.getMenu(guildId, menuId);
          if (!menu) return this.#menuGone(interaction);
          await interaction.editReply(buildDeleteConfirmCard(menu));
          return;
        }
        case "delyes": {
          if (!menuId) return;
          await this.service.deleteMenu(guildId, menuId);
          const menus = await this.service.listMenus(guildId);
          await interaction.editReply(buildMenuListCard(menus));
          return;
        }
        default:
          return;
      }
    } catch (err: unknown) {
      logError("ReactionRoles: panel button failed", err);
      const t = await fetchTyped(interaction).catch(() => null);
      await interaction
        .editReply(
          ephemeralCard(
            makeErrorCard(
              t ? t("reactionroles:panelFailedTitle") : "Panel update failed",
              err instanceof Error ? err.message : "Try again.",
            ),
          ),
        )
        .catch(() => null);
    }
  }

  async #menuGone(interaction: ButtonInteraction): Promise<void> {
    const menus = await this.service.listMenus(interaction.guildId!);
    await interaction.editReply(buildMenuListCard(menus)).catch(() => null);
  }
}
