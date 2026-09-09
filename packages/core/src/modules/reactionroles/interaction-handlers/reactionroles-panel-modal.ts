import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Interaction, ModalSubmitInteraction } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { Rr } from "#modules/reactionroles/keys.js";
import type ReactionRolesUtility from "#modules/reactionroles/utilities/ReactionRolesUtility.js";
import { ReactionRoleMenuLockedError } from "#modules/reactionroles/utilities/ReactionRolesUtility.js";
import { requireManagePermit } from "#modules/reactionroles/lib/panel-guard.js";
import { buildMenuDetailCard } from "#modules/reactionroles/ui/panel.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "reactionroles-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class ReactionRolesPanelModalHandler extends BaseInteractionHandler {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isModalSubmit()) return this.none();
    if (!interaction.customId.startsWith(`${Rr}:modal:`)) return this.none();
    const rest = interaction.customId.slice(`${Rr}:modal:`.length);
    const [kind, menuId, optionId] = rest.split(":");
    if (!kind) return this.none();
    return this.some({ kind, menuId, optionId });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    {
      kind,
      menuId,
      optionId,
    }: { kind: string; menuId?: string; optionId?: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    await requireManagePermit(interaction);
    if (!(await isModuleEnabled(interaction.guildId, "reactionroles"))) return;
    const guildId = interaction.guildId;
    const t = await fetchTyped(interaction);
    const text = (name: string) => {
      try {
        return interaction.fields.getTextInputValue(name)?.trim() ?? "";
      } catch {
        return "";
      }
    };

    try {
      if (kind === "new") {
        const title = text("title");
        const menu = await this.service.createMenu(guildId, {
          title,
          description: text("description") || null,
          color: text("color") || null,
        });
        await interaction.reply(ephemeralCard(buildMenuDetailCard(menu)));
        return;
      }
      if (!menuId) return;
      if (kind === "menuedit") {
        const menu = await this.service.updateMenu(guildId, menuId, {
          title: text("title"),
          description: text("description") || null,
          color: text("color") || null,
        });
        await interaction.reply(ephemeralCard(buildMenuDetailCard(menu)));
        return;
      }
      if (kind === "maxroles") {
        const maxRoles = Number.parseInt(text("maxRoles"), 10);
        const menu = await this.service.updateMenu(guildId, menuId, { maxRoles });
        await interaction.reply(ephemeralCard(buildMenuDetailCard(menu)));
        return;
      }
      if (kind === "optadd") {
        const menu = await this.service.addOption(guildId, menuId, {
          label: text("label"),
          emoji: text("emoji") || null,
          description: text("description") || null,
          roleId: text("roleId"),
          requiredRoleId: text("requiredRoleId") || null,
        });
        await interaction.reply(ephemeralCard(buildMenuDetailCard(menu)));
        return;
      }
      if (kind === "optedit" && optionId) {
        const menu = await this.service.editOption(guildId, menuId, optionId, {
          label: text("label"),
          emoji: text("emoji") || null,
          description: text("description") || null,
          roleId: text("roleId"),
          requiredRoleId: text("requiredRoleId") || null,
        });
        await interaction.reply(ephemeralCard(buildMenuDetailCard(menu)));
      }
    } catch (err: unknown) {
      logError("ReactionRoles: panel modal failed", err);
      const reply = ephemeralCard(
        makeErrorCard(
          err instanceof ReactionRoleMenuLockedError
            ? t("reactionroles:menuLockedTitle")
            : t("reactionroles:panelFailedTitle"),
          err instanceof Error ? err.message : "Try again.",
        ),
      );
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => null);
      } else {
        await interaction.reply(reply).catch(() => null);
      }
    }
  }
}
