import { fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getService } from "#lib/module-system/Service.js";
import { restartChoiceRow } from "#lib/restart.js";
import type { DownloaderService } from "#lib/services/DownloaderService.js";
import type { GuildSettingsService } from "#lib/services/GuildSettingsService.js";
import {
  accessDenied,
  hasAdminPermit,
  hasOwnerPermit,
  renderHub,
  renderPermissions,
  renderRepoModules,
  renderSettings,
} from "#modules/core/lib/hub-panel.js";
import { loadFeatures } from "#modules/core/lib/config-panel.js";
import {
  buildAddonInstalledView,
  buildAddonReposView,
  buildAddonsView,
  buildAutoUpdateSettingsView,
} from "#modules/core/ui/addons.js";
import { DEFAULT_PREFIX } from "#modules/core/ui/hub.js";
import { buildFeatureListView } from "#modules/core/ui/modules.js";
import { buildPermitPickerView } from "#modules/core/ui/permissions.js";
import { Emojis } from "#utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { getCoreUpdateStatus, updateLumiCore } from "#utilities/self-update.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import { TextInputStyle, type ButtonInteraction } from "discord.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class HubPanelButtonHandler extends BaseInteractionHandler {
  private static readonly ADDON_MODAL_ACTIONS = new Set([
    "add_repo",
    "rm_repo",
    "install",
    "uninstall",
  ]);

  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("lumi:")) return this.none();
    const [, action, sub, ...rest] = interaction.customId.split(":");
    return this.some({ action, sub, rest });
  }

  public async run(
    interaction: ButtonInteraction,
    { action, sub, rest }: { action: string; sub?: string; rest: string[] },
  ) {
    if (!interaction.inGuild()) return;

    // showModal() must be the interaction's first response, so modal-opening
    // actions can't defer first; every other action defers immediately to
    // beat Discord's 3s ack window before doing any permission/i18n lookups.
    const opensModal =
      (action === "prefix" && sub === "set") ||
      (action === "addon" &&
        !!sub &&
        HubPanelButtonHandler.ADDON_MODAL_ACTIONS.has(sub));
    if (!opensModal) await this.acknowledge(interaction);

    if (!(await hasAdminPermit(interaction))) throw accessDenied();

    if (action === "prefix" && sub === "set")
      return this.#openPrefixModal(interaction);
    if (
      action === "addon" &&
      sub &&
      HubPanelButtonHandler.ADDON_MODAL_ACTIONS.has(sub)
    ) {
      if (!(await hasOwnerPermit(interaction)))
        throw new UserError({
          identifier: "AccessDenied",
          message: "Only Bot Owners can manage addons.",
        });
      return this.#openAddonModal(interaction, sub);
    }

    const t = await fetchTyped(interaction);

    switch (action) {
      case "home":
        return renderHub(interaction, t);
      case "tab":
        return this.#renderTab(interaction, sub, t);
      case "prefix":
        if (sub === "reset") {
          await this.settings.resetPrefix(interaction.guildId).catch(() => {});
          return renderSettings(interaction, t);
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
          const perms = getService("permissions");
          await perms
            .unassignPermit(permitId, targetType, targetId)
            .catch(() => null);
        }
        return renderPermissions(interaction, 0, t);
      }
      case "permpage": {
        if (sub === "indicator") return undefined;
        const page = parseInt(rest[0] ?? "0", 10) || 0;
        return renderPermissions(interaction, page, t);
      }
      case "permit": {
        if (
          sub === "grant" &&
          (rest[0] === "custom" || rest[0] === "enforced")
        ) {
          const kind = rest[0];
          const perms = getService("permissions");
          const permits = (await perms.listPermits(interaction.guildId)).filter(
            (p) => p.kind === kind,
          );
          return interaction.editReply(
            buildPermitPickerView(kind, permits, t),
          );
        }
        return undefined;
      }
      case "check_core":
        return this.#checkCore(interaction);
      case "update_core":
        return this.#updateCore(interaction);
      case "addon":
        return this.#runAddonAction(interaction, sub, rest, t);
      default:
        return undefined;
    }
  }

  async #checkCore(interaction: ButtonInteraction) {
    if (!(await hasOwnerPermit(interaction)))
      throw new UserError({
        identifier: "AccessDenied",
        message: "Only Bot Owners can check core update status.",
      });

    const status = await getCoreUpdateStatus();
    if (status.error) {
      return interaction.editReply(
        ephemeralCard(makeErrorCard("Update Check Failed", status.error)),
      );
    }

    if (status.upToDate) {
      return interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            "Lumi Core Is Up To Date",
            [
              `Branch: **${status.branch}**`,
              `Commit: \`${status.currentCommit}\``,
              status.currentVersion
                ? `Version file: **${status.currentVersion}**`
                : "Version file: not found",
            ].join("\n"),
          ),
        ),
      );
    }

    const lines = [
      `Branch: **${status.branch}**`,
      `Current commit: \`${status.currentCommit}\``,
      `Latest commit: \`${status.latestCommit ?? "unknown"}\``,
      `Behind by: **${status.behindBy}** commit(s)`,
    ];

    if (status.currentVersion || status.remoteVersion) {
      lines.push(
        `Local version file: **${status.currentVersion ?? "not found"}**`,
        `Remote version file: **${status.remoteVersion ?? "not found"}**`,
      );
    }

    return interaction.editReply(
      ephemeralCard(
        makeInfoCard("Core Update Available", lines, {
          footer: "Use 'Update Lumi Core' when you are ready.",
        }),
      ),
    );
  }

  async #updateCore(interaction: ButtonInteraction) {
    if (!(await hasOwnerPermit(interaction)))
      throw new UserError({
        identifier: "AccessDenied",
        message: "Only Bot Owners can update Lumi core.",
      });

    const res = await updateLumiCore();
    if (res.error) {
      return interaction.editReply(
        ephemeralCard(makeErrorCard("Core Update Failed", res.error)),
      );
    }

    if (res.updated) {
      const body = `Successfully updated Lumi core codebase! (**${res.commitsCount}** new commit(s) pulled).\n\n**New Commit:** \`${res.latestCommit}\` (from \`${res.currentCommit}\`)\n\n**Changelog:**\n\`\`\`\n${res.changelog}\n\`\`\``;
      return interaction.editReply(
        ephemeralCard(
          makeSuccessCard(`${Emojis.BOT} Lumi Core Updated`, body, {
            actionRows: [restartChoiceRow(interaction.user.id)],
          }),
        ),
      );
    }

    return interaction.editReply(
      ephemeralCard(
        makeSuccessCard(
          `${Emojis.BOT} Lumi Core Up to Date`,
          `Lumi core is already running the latest commit (\`${res.currentCommit}\`).`,
        ),
      ),
    );
  }

  async #runAddonAction(
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
      return this.#renderAddonRepos(interaction, t);
    }
    if (sub === "installed") {
      return this.#renderAddonInstalled(interaction, t);
    }
    if (sub === "autoupdate") {
      const config = await this.downloader.getAutoUpdateConfig();
      return interaction.editReply(buildAutoUpdateSettingsView(config, t));
    }
    if (sub === "autoupdate_toggle") {
      const config = await this.downloader.getAutoUpdateConfig();
      await this.downloader.setAutoUpdateConfig({ enabled: !config.enabled });
      const next = await this.downloader.getAutoUpdateConfig();
      return interaction.editReply(buildAutoUpdateSettingsView(next, t));
    }
    if (sub === "toggle") {
      const moduleName = rest.join(":");
      if (!moduleName) return undefined;
      try {
        const record = this.container.moduleStore.getRecord(moduleName);
        await this.downloader.toggleModule(moduleName, !record?.enabled);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }
      return this.#renderAddonInstalled(interaction, t);
    }
    if (sub === "update_repo") {
      const repoName = rest.join(":");
      if (!repoName) return undefined;
      try {
        await this.downloader.updateRepo(repoName);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }
      return this.#renderAddonRepos(interaction, t);
    }
    if (sub === "browsepage") {
      const [repoName, dir, pageStr] = rest;
      if (!repoName || dir === "indicator") return undefined;
      const page = parseInt(pageStr ?? "0", 10) || 0;
      return renderRepoModules(interaction, repoName, t, page);
    }
    if (sub === "modact") {
      const [act, repoName, ...moduleParts] = rest;
      const moduleName = moduleParts.join(":");
      if (!act || !repoName || !moduleName) return undefined;
      try {
        if (act === "install") {
          await this.downloader.installModule(repoName, moduleName);
        } else if (act === "uninstall") {
          await this.downloader.uninstallModule(moduleName);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return interaction.followUp(
          ephemeralCard(makeErrorCard("Action Failed", msg)),
        );
      }
      return renderRepoModules(interaction, repoName, t);
    }
    return undefined;
  }

  async #renderTab(
    interaction: ButtonInteraction,
    tab: string | undefined,
    t?: LumiT,
  ) {
    switch (tab) {
      case "home":
        return renderHub(interaction, t);
      case "modules": {
        const features = await loadFeatures(interaction.guildId!);
        return interaction.editReply(buildFeatureListView(features, 0, t));
      }
      case "permissions":
        return renderPermissions(interaction, 0, t);
      case "settings":
        return renderSettings(interaction, t);
      case "addons":
        return this.#renderAddonDashboard(interaction, t);
      default:
        return undefined;
    }
  }

  async #renderAddonDashboard(interaction: ButtonInteraction, t?: LumiT) {
    const [repos, installed, pendingUpdates] = await Promise.all([
      this.downloader.listRepos(),
      this.downloader.getInstalledModulesDetailed(),
      this.downloader.checkForUpdates(),
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

  async #renderAddonRepos(interaction: ButtonInteraction, t?: LumiT) {
    const [repos, installed] = await Promise.all([
      this.downloader.listRepos(),
      this.downloader.getInstalledModulesDetailed(),
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
          installedCount: installedByRepo.get(repo.id) ?? 0,
        })),
        t,
      ),
    );
  }

  async #renderAddonInstalled(interaction: ButtonInteraction, t?: LumiT) {
    const [installed, repos] = await Promise.all([
      this.downloader.getInstalledModulesDetailed(),
      this.downloader.listRepos(),
    ]);

    return interaction.editReply(
      buildAddonInstalledView(
        installed.map((row) => ({
          moduleName: row.moduleName,
          version: row.version,
          repoName: row.repo.name,
          installedAt: row.installedAt,
          enabled:
            this.container.moduleStore.getRecord(row.moduleName)?.enabled ??
            true,
        })),
        repos.map((repo) => ({ name: repo.name })),
        t,
      ),
    );
  }

  private get downloader(): DownloaderService {
    return getService("downloader");
  }

  #openPrefixModal(interaction: ButtonInteraction) {
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
            .setPlaceholder(`e.g. ${DEFAULT_PREFIX}`),
        ),
      );
    return interaction.showModal(modal);
  }

  #openAddonModal(interaction: ButtonInteraction, action: string) {
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

    const modal = new ModalBuilder().setCustomId(`lumi:addonmodal:${action}`);

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
}
