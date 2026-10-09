import { fetchTyped } from "#lib/i18n/index.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  acknowledge,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import type { Container } from "#lib/services.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { DownloaderUtility } from "../../utilities/DownloaderUtility.js";
import type { GuildSettingsUtility } from "../../utilities/GuildSettingsUtility.js";
import {
  accessDenied,
  hasAdminPermit,
  hasOwnerPermit,
  renderHub,
  renderPermissions,
  renderRepoModules,
  renderSettings,
} from "../../services/hub-panel.js";
import { loadFeatures } from "../../services/config-panel.js";
import {
  buildAddonInstalledView,
  buildAddonReposView,
  buildAddonsView,
  buildAutoUpdateSettingsView,
  buildRepoUpdateConfirmView,
} from "#modules/core/ui/addons.js";
import { DefaultPrefix } from "#modules/core/ui/hub.js";
import { buildFeatureListView } from "#modules/core/ui/modules.js";
import { buildPermitPickerView } from "#modules/core/ui/permissions.js";
import { ephemeralCard, makeErrorCard, makeInfoCard, makeSuccessCard } from "#lib/ui/cards.js";
import { HubAddonModalId, HubId } from "../../constants.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import { UserError } from "@lumi/shared";
import { TextInputStyle, type ButtonInteraction } from "discord.js";

const ADDON_MODAL_ACTIONS = new Set([
  "add_repo",
  "rm_repo",
  "install",
  "uninstall",
]);

export const hubPanelButton = defineInteraction({
  prefix: HubId.prefix,
  async run(services: Container, interaction: ButtonInteraction) {
    const parsed = HubId.parse(interaction.customId);
    if (!parsed) return;
    const { action, rest: tail } = parsed;
    const [sub, ...rest] = tail;
    const settings: GuildSettingsUtility = getUtility("guild-settings");
    const downloader: DownloaderUtility = getUtility("downloader");
    if (!interaction.inGuild()) return;

    // showModal() must be the interaction's first response, so modal-opening
    // actions can't defer first; every other action defers immediately to
    // beat Discord's 3s ack window before doing any permission/i18n lookups.
    const opensModal =
      (action === "prefix" && sub === "set") ||
      (action === "addon" &&
        !!sub &&
        ADDON_MODAL_ACTIONS.has(sub));
    if (!opensModal) await acknowledge(interaction);

    if (!(await hasAdminPermit(interaction))) throw accessDenied();

    if (action === "prefix" && sub === "set")
      return openPrefixModal(interaction);
    if (
      action === "addon" &&
      sub &&
      ADDON_MODAL_ACTIONS.has(sub)
    ) {
      if (!(await hasOwnerPermit(interaction)))
        throw new UserError({
          identifier: "AccessDenied",
          message: "Only Bot Owners can manage addons.",
        });
      return openAddonModal(interaction, sub);
    }

    const t = await fetchTyped(interaction);

    switch (action) {
      case "home":
        return renderHub(services, interaction, t);
      case "tab":
        return renderTab(services, downloader, interaction, sub, t);
      case "prefix":
        if (sub === "reset") {
          await settings.resetPrefix(services, interaction.guildId).catch(() => {});
          return renderSettings(services, interaction, t);
        }
        return undefined;
      case "permdel": {
        const raw = [sub, ...rest].join(":");
        const [permitIdRaw, targetType, targetId] = raw.split("|");
        const permitId = Number(permitIdRaw);
        if (
          Number.isInteger(permitId) &&
          targetId &&
          (targetType === "role" || targetType === "user")
        ) {
          const perms = getUtility("permissions");
          await perms
            .unassignPermit(
              services,
              interaction.guildId,
              permitId,
              targetType,
              targetId,
            )
            .catch(() => null);
        }
        return renderPermissions(services, interaction, 0, t);
      }
      case "permpage": {
        if (sub === "indicator") return undefined;
        const page = parseInt(rest[0] ?? "0", 10) || 0;
        return renderPermissions(services, interaction, page, t);
      }
      case "permit": {
        if (
          sub === "grant" &&
          (rest[0] === "custom" || rest[0] === "enforced")
        ) {
          const kind = rest[0];
          const perms = getUtility("permissions");
          const permits = (await perms.listPermits(services, interaction.guildId)).filter(
            (p) => p.kind === kind,
          );
          return interaction.editReply(
            buildPermitPickerView(kind, permits, t),
          );
        }
        return undefined;
      }
      case "update_all":
        return updateAllRepos(services, downloader, interaction, t);
      case "addon":
        return runAddonAction(services, downloader, interaction, sub, rest, t);
      default:
        return undefined;
    }
  },
});

async function updateAllRepos(services: Container, downloader: DownloaderUtility, interaction: ButtonInteraction, t?: LumiT) {
    if (!(await hasOwnerPermit(interaction)))
      throw new UserError({
        identifier: "AccessDenied",
        message: "Only Bot Owners can manage add-ons.",
      });

    const repos = await downloader.listRepos(services);
    if (repos.length === 0) {
      await interaction.followUp(
        ephemeralCard(
          makeInfoCard("No Repositories", "No add-on repositories are added."),
        ),
      );
      return renderAddonRepos(services, downloader, interaction, t);
    }

    const updated: string[] = [];
    const failed: string[] = [];
    for (const repo of repos) {
      try {
        await downloader.updateRepo(services, repo.name);
        updated.push(repo.name);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push(`**${repo.name}** - ${msg}`);
      }
    }

    await interaction.followUp(
      ephemeralCard(
        failed.length === 0
          ? makeSuccessCard(
              "Add-ons Updated",
              `Updated ${updated.length} repositor${updated.length === 1 ? "y" : "ies"}.`,
            )
          : makeErrorCard(
              "Some Add-ons Failed To Update",
              [
                updated.length > 0
                  ? `Updated: ${updated.join(", ")}`
                  : "Nothing updated.",
                ...failed,
              ].join("\n"),
            ),
      ),
    );
    return renderAddonRepos(services, downloader, interaction, t);
  }

  async function runAddonAction(
    services: Container,
    downloader: DownloaderUtility,
    interaction: ButtonInteraction,
    sub: string | undefined,
    rest: string[],
    t?: LumiT,
  ) {
    if (!(await hasOwnerPermit(interaction)))
      throw new UserError({
        identifier: "AccessDenied",
        message: "Only Bot Owners can manage add-ons.",
      });
    if (sub === "repos" || sub === "modules") {
      return renderAddonRepos(services, downloader, interaction, t);
    }
    if (sub === "installed") {
      return renderAddonInstalled(services, downloader, interaction, t);
    }
    if (sub === "autoupdate") {
      const config = await downloader.getAutoUpdateConfig(services);
      return interaction.editReply(buildAutoUpdateSettingsView(config, t));
    }
    if (sub === "autoupdate_toggle") {
      const config = await downloader.getAutoUpdateConfig(services);
      await downloader.setAutoUpdateConfig(services, { enabled: !config.enabled });
      const next = await downloader.getAutoUpdateConfig(services);
      return interaction.editReply(buildAutoUpdateSettingsView(next, t));
    }
    if (sub === "toggle") {
      const moduleName = rest.join(":");
      if (!moduleName) return undefined;
      try {
        const record = services.moduleStore.getRecord(moduleName);
        await downloader.toggleModule(services, moduleName, !record?.enabled);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }
      return renderAddonInstalled(services, downloader, interaction, t);
    }
    if (sub === "update_repo") {
      const repoName = rest.join(":");
      if (!repoName) return undefined;
      try {
        const check = await downloader.checkRepoUpdate(services, repoName);
        if (!check.ok) {
          await interaction.followUp(
            ephemeralCard(makeErrorCard("Check Failed", check.reason)),
          );
          return renderAddonRepos(services, downloader, interaction, t);
        }
        if (!check.hasUpdate) {
          await interaction.followUp(
            ephemeralCard(
              makeInfoCard(
                "Already Up To Date",
                `**${repoName}** has no pending updates.`,
              ),
            ),
          );
          return renderAddonRepos(services, downloader, interaction, t);
        }
        return interaction.editReply(
          buildRepoUpdateConfirmView(repoName, check.changelog, t),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }
    }
    if (sub === "update_repo_confirm") {
      const repoName = rest.join(":");
      if (!repoName) return undefined;
      try {
        const result = await downloader.updateRepo(services, repoName);
        const shaLine = result.changed
          ? `\`${(result.oldSha ?? "?").slice(0, 7)}\` → \`${result.newSha.slice(0, 7)}\``
          : "Already up to date.";
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              "Repository Updated",
              [`**${repoName}** was updated.`, shaLine, result.diffStat]
                .filter(Boolean)
                .join("\n\n"),
            ),
          ),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await interaction.followUp(
          ephemeralCard(makeErrorCard("Update Failed", msg)),
        );
      }
      return renderAddonRepos(services, downloader, interaction, t);
    }
    if (sub === "update_repo_skip") {
      return renderAddonRepos(services, downloader, interaction, t);
    }
    if (sub === "browsepage") {
      const [repoName, dir, pageStr] = rest;
      if (!repoName || dir === "indicator") return undefined;
      const page = parseInt(pageStr ?? "0", 10) || 0;
      return renderRepoModules(services, interaction, repoName, t, page);
    }
    if (sub === "modact") {
      const [act, repoName, ...moduleParts] = rest;
      const moduleName = moduleParts.join(":");
      if (!act || !repoName || !moduleName) return undefined;
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
      return renderRepoModules(services, interaction, repoName, t);
    }
    if (sub === "modinfo") {
      const [repoName, ...moduleParts] = rest;
      const moduleName = moduleParts.join(":");
      if (!repoName || !moduleName) return undefined;
      const modules = await downloader.getModulesInRepo(repoName);
      const mod = modules.find((m) => m.name === moduleName);
      if (!mod) {
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Not Found", `Module **${moduleName}** was not found in **${repoName}**.`)),
        );
      }
      const lines = [
        `### 📦 __${mod.name}__ (v${mod.version})`,
        mod.description ? `*${mod.description}*` : "*No description provided.*",
        "",
        `**Author:** ${mod.author || "Unknown"}`,
        `**Min Bot Version:** \`${mod.min_bot_version || "Any"}\``,
        "",
        "### 🛡️ __Data & Privacy Statement__",
        mod.end_user_data_statement || "*This module has not specified an end-user data statement.*",
      ];
      return interaction.followUp(
        ephemeralCard(makeInfoCard(`Module Info: ${mod.name}`, lines)),
      );
    }
    return undefined;
  }

  async function renderTab(
    services: Container,
    downloader: DownloaderUtility,
    interaction: ButtonInteraction,
    tab: string | undefined,
    t?: LumiT,
  ) {
    switch (tab) {
      case "home":
        return renderHub(services, interaction, t);
      case "modules": {
        const features = await loadFeatures(services, interaction.guildId!);
        return interaction.editReply(buildFeatureListView(features, 0, t));
      }
      case "permissions":
        return renderPermissions(services, interaction, 0, t);
      case "settings":
        return renderSettings(services, interaction, t);
      case "addons":
        return renderAddonDashboard(services, downloader, interaction, t);
      default:
        return undefined;
    }
  }

  async function renderAddonDashboard(services: Container, downloader: DownloaderUtility, interaction: ButtonInteraction, t?: LumiT) {
    const [repos, installed, pendingUpdates] = await Promise.all([
      downloader.listRepos(services),
      downloader.getInstalledModulesDetailed(services),
      downloader.checkForUpdates(services),
    ]);
    return interaction.editReply(
      buildAddonsView(
        {
          repoCount: repos.length,
          installedCount: installed.length,
          pendingUpdates,
        },
        t,
      ),
    );
  }

  async function renderAddonRepos(services: Container, downloader: DownloaderUtility, interaction: ButtonInteraction, t?: LumiT) {
    const [repos, installed] = await Promise.all([
      downloader.listRepos(services),
      downloader.getInstalledModulesDetailed(services),
    ]);

    const installedByRepo = new Map<number, number>();
    for (const row of installed) {
      installedByRepo.set(
        row.repoId,
        (installedByRepo.get(row.repoId) ?? 0) + 1,
      );
    }

    return interaction.editReply(
      buildAddonReposView(
        repos.map((repo) => ({
          name: repo.name,
          url: repo.url,
          branch: repo.branch,
          commit: repo.commit,
          installedCount: installedByRepo.get(repo.id) ?? 0,
        })),
        t,
      ),
    );
  }

  async function renderAddonInstalled(services: Container, downloader: DownloaderUtility, interaction: ButtonInteraction, t?: LumiT) {
    const [installed, repos] = await Promise.all([
      downloader.getInstalledModulesDetailed(services),
      downloader.listRepos(services),
    ]);

    return interaction.editReply(
      buildAddonInstalledView(
        installed.map((row) => ({
          moduleName: row.moduleName,
          version: row.version,
          repoName: row.repo.name,
          installedAt: row.installedAt,
          enabled:
            services.moduleStore.getRecord(row.moduleName)?.enabled ??
            true,
        })),
        repos.map((repo) => ({ name: repo.name })),
        t,
      ),
    );
}

function openPrefixModal(interaction: ButtonInteraction) {
    const modal = new ModalBuilder()
      .setCustomId("lumi:prefixmodal")
      .setTitle("Set Command Prefix")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("prefix")
            .setLabel("New prefix")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(5)
            .setPlaceholder(`e.g. ${DefaultPrefix}`),
        ),
      );
    return interaction.showModal(modal);
  }

function openAddonModal(interaction: ButtonInteraction, action: string) {
    const field = (
      id: string,
      label: string,
      placeholder: string,
      required: boolean = true,
    ) =>
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(required)
          .setPlaceholder(placeholder),
      );

    const modal = new ModalBuilder().setCustomId(
      HubAddonModalId.build({ action }),
    );

    if (action === "add_repo") {
      modal
        .setTitle("Add Repository")
        .addComponents(
          field("url", "Repository URL", "e.g. https://github.com/owner/repo"),
          field(
            "name",
            "Repository Name (optional)",
            "Leave blank to derive from the URL",
            false,
          ),
          field("branch", "Branch", "default: main", false),
        );
    } else if (action === "rm_repo") {
      modal
        .setTitle("Remove Repository")
        .addComponents(field("name", "Repository Name", "e.g. lumi-addons"));
    } else if (action === "install") {
      modal
        .setTitle("Install Module")
        .addComponents(
          field("repo", "Repository Name", "e.g. lumi-addons"),
          field("module", "Module Name", "e.g. activity-roles"),
        );
    } else if (action === "uninstall") {
      modal
        .setTitle("Uninstall Module")
        .addComponents(field("module", "Module Name", "e.g. activity-roles"));
    }
    return interaction.showModal(modal);
}
