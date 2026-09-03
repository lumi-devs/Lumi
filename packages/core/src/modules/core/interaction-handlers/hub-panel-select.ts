import { fetchTyped } from "#lib/commands.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { GuildSettingsUtility } from "#utilities/pieces/GuildSettingsUtility.js";
import type { PermissionUtility } from "#utilities/pieces/PermissionUtility.js";
import {
  accessDenied,
  hasAdminPermit,
  hasOwnerPermit,
  renderPermissions,
  renderRepoModules,
  renderSettings,
} from "#modules/core/lib/hub-panel.js";
import { buildAutoUpdateSettingsView } from "#modules/core/ui/addons.js";
import {
  buildPermitAssignTargetView,
  type PermitKind,
} from "#modules/core/ui/permissions.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeWarningCard,
} from "#utilities/cards.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import type { AnySelectMenuInteraction } from "discord.js";

const ownerOnly = () =>
  new UserError({
    identifier: "AccessDenied",
    message: "Only Bot Owners can manage add-ons.",
  });

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class HubPanelSelectHandler extends BaseInteractionHandler {
  private get settings(): GuildSettingsUtility {
    return getUtility("guild-settings");
  }

  private get perms(): PermissionUtility {
    return getUtility("permissions");
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (interaction.customId === "lumi:setlang") return this.some("lang");
    if (interaction.customId.startsWith("lumi:permit:pick:"))
      return this.some("permit_pick");
    if (interaction.customId.startsWith("lumi:permit:assign:"))
      return this.some("permit_assign");
    if (interaction.customId === "lumi:addon:repo_pick")
      return this.some("addon_repo_pick");
    if (interaction.customId.startsWith("lumi:addon:mod_action:"))
      return this.some("addon_mod_action");
    if (interaction.customId === "lumi:addon:autoupdate_interval")
      return this.some("addon_autoupdate_interval");
    return this.none();
  }

  public async run(interaction: AnySelectMenuInteraction, kind: string) {
    if (!interaction.inGuild()) return;
    await this.acknowledge(interaction);
    if (!(await hasAdminPermit(interaction))) throw accessDenied();
    const t = await fetchTyped(interaction);

    if (kind === "lang") {
      const language = interaction.values[0];
      if (language)
        await this.settings
          .setLanguage(interaction.guildId, language)
          .catch(() => {});
      return renderSettings(interaction, t);
    }

    if (kind === "addon_mod_action") {
      if (!(await hasOwnerPermit(interaction))) throw ownerOnly();

      const val = interaction.values[0] ?? "";
      const [act, repoName, moduleName] = val.split(":");
      if (!act || !repoName || !moduleName) return;

      const downloader = getUtility("downloader");
      try {
        if (act === "install") {
          await downloader.installModule(repoName, moduleName);
        } else if (act === "uninstall") {
          await downloader.uninstallModule(moduleName);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }

      return renderRepoModules(interaction, repoName, t, 0);
    }

    if (kind === "addon_repo_pick") {
      if (!(await hasOwnerPermit(interaction))) throw ownerOnly();

      const repoName = interaction.values[0];
      if (!repoName) {
        return interaction.editReply(
          ephemeralCard(
            makeWarningCard("Missing Repository", "Please pick a repository."),
          ),
        );
      }

      return renderRepoModules(interaction, repoName, t, 0);
    }

    if (kind === "addon_autoupdate_interval") {
      if (!(await hasOwnerPermit(interaction))) throw ownerOnly();
      const minutes = Number(interaction.values[0]);
      const downloader = getUtility("downloader");
      await downloader.setAutoUpdateConfig({ intervalMinutes: minutes });
      const config = await downloader.getAutoUpdateConfig();
      return interaction.editReply(buildAutoUpdateSettingsView(config, t));
    }

    if (kind === "permit_pick") {
      const permitKind = interaction.customId.split(":")[3] as PermitKind;
      const permitId = Number(interaction.values[0]);
      if (!Number.isInteger(permitId)) return renderPermissions(interaction, 0, t);
      const permit = await this.perms.getPermit(interaction.guildId, permitId);
      if (!permit) return renderPermissions(interaction, 0, t);
      return interaction.editReply(
        buildPermitAssignTargetView(permit.id, permit.name, permitKind, t),
      );
    }

    if (kind === "permit_assign") {
      const permitId = Number(interaction.customId.split(":")[3]);
      const targetId = interaction.values[0];
      if (Number.isInteger(permitId) && targetId) {
        const targetType: "role" | "user" = interaction.isRoleSelectMenu()
          ? "role"
          : "user";
        await this.perms
          .assignPermit(interaction.guildId, permitId, targetType, targetId)
          .catch(() => {});
      }
      return renderPermissions(interaction, 0, t);
    }

    return renderPermissions(interaction, 0, t);
  }
}
