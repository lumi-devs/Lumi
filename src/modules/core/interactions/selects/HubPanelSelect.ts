import { fetchTyped } from "#src/lib/i18n/Index.js";
import type { Container } from "#src/lib/Services.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { GuildSettingsUtility } from "#src/modules/core/utilities/GuildSettingsUtility.js";
import type { PermissionUtility } from "#src/modules/core/utilities/PermissionUtility.js";
import {
  accessDenied,
  hasAdminPermit,
  hasOwnerPermit,
  renderPermitExplain,
  renderPermissions,
  renderRepoModules,
  renderSettings,
} from "#src/modules/core/services/HubPanel.js";
import { buildAutoUpdateSettingsView } from "#src/modules/core/ui/Addons.js";
import {
  buildPermitAssignTargetView,
  type PermitKind,
} from "#src/modules/core/ui/Permissions.js";
import { ephemeralCard, makeErrorCard, makeWarningCard } from "#src/lib/ui/Cards.js";
import {
  HubAddonModActionId,
  HubPermitAssignId,
  HubPermitExplainNodeId,
  HubPermitPickId,
} from "#src/modules/core/Constants.js";
import { UserError } from "#src/shared/Index.ts";
import type { AnySelectMenuInteraction } from "discord.js";

const ownerOnly = () =>
  new UserError({
    identifier: "AccessDenied",
    message: "Only Bot Owners can manage add-ons.",
  });

export const hubPanelSelect = defineInteraction({
  prefix: [
    "lumi:setlang",
    HubPermitPickId.prefix,
    HubPermitAssignId.prefix,
    HubPermitExplainNodeId.prefix,
    "lumi:permexplainuser",
    "lumi:addon:repo_pick",
    HubAddonModActionId.prefix,
    "lumi:addon:autoupdate_interval",
  ],
  async run(services: Container, interaction: AnySelectMenuInteraction) {
    let kind: string | null = null;
    if (interaction.customId === "lumi:setlang") kind = "lang";
    else if (HubPermitPickId.parse(interaction.customId)) kind = "permit_pick";
    else if (HubPermitAssignId.parse(interaction.customId))
      kind = "permit_assign";
    else if (interaction.customId === "lumi:permexplainuser")
      kind = "permexplain_user";
    else if (HubPermitExplainNodeId.parse(interaction.customId))
      kind = "permexplain_node";
    else if (interaction.customId === "lumi:addon:repo_pick")
      kind = "addon_repo_pick";
    else if (HubAddonModActionId.parse(interaction.customId))
      kind = "addon_mod_action";
    else if (interaction.customId === "lumi:addon:autoupdate_interval")
      kind = "addon_autoupdate_interval";
    if (!kind) return;
    const settings: GuildSettingsUtility = getUtility("guild-settings");
    const perms: PermissionUtility = getUtility("permissions");
    if (!interaction.inGuild()) return;
    await acknowledge(interaction);
    if (!(await hasAdminPermit(interaction))) throw accessDenied();
    const t = await fetchTyped(interaction);

    if (kind === "lang") {
      const language = interaction.values[0];
      if (language)
        await settings
          .setLanguage(services, interaction.guildId, language)
          .catch(() => {});
      return renderSettings(services, interaction, t);
    }

    if (kind === "addon_mod_action") {
      if (!(await hasOwnerPermit(interaction))) throw ownerOnly();

      const val = interaction.values[0] ?? "";
      const [act, repoName, moduleName] = val.split(":");
      if (!act || !repoName || !moduleName) return;

      const downloader = getUtility("downloader");
      try {
        if (act === "install") {
          await downloader.installModule(services, repoName, moduleName);
        } else if (act === "uninstall") {
          await downloader.uninstallModule(services, moduleName);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }

      return renderRepoModules(services, interaction, repoName, t, 0);
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

      return renderRepoModules(services, interaction, repoName, t, 0);
    }

    if (kind === "addon_autoupdate_interval") {
      if (!(await hasOwnerPermit(interaction))) throw ownerOnly();
      const minutes = Number(interaction.values[0]);
      const downloader = getUtility("downloader");
      await downloader.setAutoUpdateConfig(services, { intervalMinutes: minutes });
      const config = await downloader.getAutoUpdateConfig(services);
      return interaction.editReply(buildAutoUpdateSettingsView(config, t));
    }

    if (kind === "permit_pick") {
      const permitKind = interaction.customId.split(":")[3] as PermitKind;
      const permitId = Number(interaction.values[0]);
      if (!Number.isInteger(permitId)) return renderPermissions(services, interaction, 0, t);
      const permit = await perms.getPermit(services, interaction.guildId, permitId);
      if (!permit) return renderPermissions(services, interaction, 0, t);
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
        await perms
          .assignPermit(services, interaction.guildId, permitId, targetType, targetId)
          .catch(() => {});
      }
      return renderPermissions(services, interaction, 0, t);
    }

    if (kind === "permexplain_user") {
      const userId = interaction.values[0];
      return renderPermitExplain(services, interaction, { userId }, t);
    }

    if (kind === "permexplain_node") {
      const parsed = HubPermitExplainNodeId.parse(interaction.customId);
      const node = interaction.values[0];
      return renderPermitExplain(
        services,
        interaction,
        { userId: parsed?.userId, node },
        t,
      );
    }

    return renderPermissions(services, interaction, 0, t);
  },
});
