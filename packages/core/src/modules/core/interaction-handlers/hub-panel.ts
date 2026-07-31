import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  MessageFlags,
  TextInputStyle,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getService } from "#lib/module-system/Service.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { hasRequiredPermit } from "#lib/permissions/index.js";
import { collectKnownPermitNodes } from "#lib/permissions/nodes.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import { restartChoiceRow } from "#lib/restart.js";
import { getCoreUpdateStatus, updateLumiCore } from "#lib/utilities/self-update.js";
import { loadFeatures, buildFeatureListView } from "#modules/core/lib/config-panel.js";
import {
  buildHubView,
  buildSettingsView,
  buildPermissionsView,
  buildPermitTargetPickerView,
  buildPermitNodePickerView,
  buildAddonsView,
  buildAddonInstalledView,
  buildAddonRepoModulesView,
  buildAddonReposView,
  buildAutoUpdateSettingsView,
  DEFAULT_PREFIX,
  type PermitKind,
} from "#modules/core/lib/hub-panel.js";
import type { GuildSettingsService } from "#lib/services/GuildSettingsService.js";
import type { PermissionService } from "#lib/services/PermissionService.js";
import type { DownloaderService } from "#lib/services/DownloaderService.js";

const accessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `${Emojis.CROSS} You need the \`admin.*\` permit to manage this server.`,
  });

type PanelInteraction =
  ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/** Wick-style permit checks for the hub panel: same nodes /lumi and /download require. */
const hasAdminPermit = (interaction: PanelInteraction) =>
  hasRequiredPermit(interaction, "admin.*");
const hasOwnerPermit = (interaction: PanelInteraction) =>
  hasRequiredPermit(interaction, "owner.*");

async function renderHub(interaction: ButtonInteraction, t?: LumiT) {
  const guildId = interaction.guildId!;
  const [features, settings] = await Promise.all([
    loadFeatures(guildId),
    container.db.config.getGuildSettings(guildId),
  ]);
  return interaction.editReply(
    buildHubView(
      {
        moduleCount: features.length,
        enabledCount: features.filter((f) => f.guildEnabled).length,
        prefix: settings.prefix,
        locale: settings.locale,
        iconUrl:
          interaction.guild?.iconURL() ??
          container.client.user?.displayAvatarURL(),
      },
      t,
    ),
  );
}

async function renderSettings(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  t?: LumiT,
) {
  const settings = await container.db.config.getGuildSettings(
    interaction.guildId!,
  );
  return interaction.editReply(
    buildSettingsView({ prefix: settings.prefix, locale: settings.locale }, t),
  );
}

async function loadPermissionOverrides(guildId: string) {
  const permits = await container.db.permissions.getGuildPermits(guildId);
  return [
    ...permits.custom.map((c) => ({
      commandPath: c.permit,
      modelType: c.targetType,
      modelId: c.targetId,
      enforced: false,
    })),
    ...permits.enforced.map((c) => ({
      commandPath: c.permit,
      modelType: c.targetType,
      modelId: c.targetId,
      enforced: true,
    })),
  ];
}

async function renderPermissions(
  interaction: ButtonInteraction | AnySelectMenuInteraction,
  page = 0,
  t?: LumiT,
) {
  const overrides = await loadPermissionOverrides(interaction.guildId!);
  return interaction.editReply(buildPermissionsView(overrides, page, t));
}

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
        const [kind, modelType, modelId, ...permitParts] = raw.split("|");
        const permit = permitParts.join("|");
        if (
          permit &&
          modelId &&
          (modelType === "role" || modelType === "user")
        ) {
          const perms = getService("permissions");
          await (kind === "e"
            ? perms.revokeEnforcedPermit(
                interaction.guildId,
                modelType,
                modelId,
                permit,
              )
            : perms.revokeCustomPermit(
                interaction.guildId,
                modelType,
                modelId,
                permit,
              )
          ).catch(() => null);
        }
        return renderPermissions(interaction, 0, t);
      }
      case "permpage": {
        if (sub === "indicator") return undefined;
        const page = parseInt(rest[0] ?? "0", 10) || 0;
        return renderPermissions(interaction, page, t);
      }
      case "permit": {
        if (sub === "grant" && (rest[0] === "custom" || rest[0] === "enforced")) {
          return interaction.editReply(
            buildPermitTargetPickerView(rest[0], t),
          );
        }
        return undefined;
      }
      case "check_core": {
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
      case "update_core": {
        if (!(await hasOwnerPermit(interaction)))
          throw new UserError({
            identifier: "AccessDenied",
            message: "Only Bot Owners can update Lumi core.",
          });

        const res = await updateLumiCore();
        if (res.error) {
          return interaction.editReply(
            ephemeralCard(
              makeErrorCard("Core Update Failed", res.error),
            ),
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
      case "addon": {
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
          await this.downloader.setAutoUpdateConfig({
            enabled: !config.enabled,
          });
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
          return this.#renderRepoModules(interaction, repoName, t, page);
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
          return this.#renderRepoModules(interaction, repoName, t);
        }
        return undefined;
      }
      default:
        return undefined;
    }
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
      installedByRepo.set(row.repoId, (installedByRepo.get(row.repoId) ?? 0) + 1);
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
          enabled: this.container.moduleStore.getRecord(row.moduleName)?.enabled ?? true,
        })),
        repos.map((repo) => ({ name: repo.name })),
        t,
      ),
    );
  }

  async #renderRepoModules(
    interaction: ButtonInteraction,
    repoName: string,
    t?: LumiT,
    page = 0,
  ) {
    const [modules, installedDetailed] = await Promise.all([
      this.downloader.getModulesInRepo(repoName),
      this.downloader.getInstalledModulesDetailed(),
    ]);
    const installed = new Set(
      installedDetailed
        .filter((row) => row.repo.name === repoName)
        .map((row) => row.moduleName),
    );

    return interaction.editReply(
      buildAddonRepoModulesView(
        repoName,
        modules.map((moduleInfo) => ({
          name: moduleInfo.name,
          version: moduleInfo.version,
          short: moduleInfo.short,
          hidden: moduleInfo.hidden,
          isInstalled: installed.has(moduleInfo.name),
        })),
        page,
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
          field("name", "Repository Name", "e.g. lumi-addons"),
          field("url", "Repository URL", "e.g. https://github.com/..."),
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

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class HubPanelSelectHandler extends BaseInteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  private get perms(): PermissionService {
    return getService("permissions");
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (interaction.customId === "lumi:setlang") return this.some("lang");
    if (interaction.customId.startsWith("lumi:permit:target:"))
      return this.some("permit_target");
    if (interaction.customId.startsWith("lumi:permit:node:"))
      return this.some("permit_node");
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
      if (!(await hasOwnerPermit(interaction))) {
        throw new UserError({
          identifier: "AccessDenied",
          message: "Only Bot Owners can manage add-ons.",
        });
      }

      const val = interaction.values[0] ?? "";
      const [act, repoName, moduleName] = val.split(":");
      if (!act || !repoName || !moduleName) return;

      const downloader = getService("downloader");
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

      const [modules, installedDetailed] = await Promise.all([
        downloader.getModulesInRepo(repoName),
        downloader.getInstalledModulesDetailed(),
      ]);
      const installed = new Set(
        installedDetailed
          .filter((row) => row.repo.name === repoName)
          .map((row) => row.moduleName),
      );

      return interaction.editReply(
        buildAddonRepoModulesView(
          repoName,
          modules.map((moduleInfo) => ({
            name: moduleInfo.name,
            version: moduleInfo.version,
            short: moduleInfo.short,
            hidden: moduleInfo.hidden,
            isInstalled: installed.has(moduleInfo.name),
          })),
          0,
          t,
        ),
      );
    }

    if (kind === "addon_repo_pick") {
      if (!(await hasOwnerPermit(interaction))) {
        throw new UserError({
          identifier: "AccessDenied",
          message: "Only Bot Owners can manage add-ons.",
        });
      }

      const repoName = interaction.values[0];
      if (!repoName) {
        return interaction.editReply(
          ephemeralCard(
            makeWarningCard("Missing Repository", "Please pick a repository."),
          ),
        );
      }

      const downloader = getService("downloader");
      const [modules, installedDetailed] = await Promise.all([
        downloader.getModulesInRepo(repoName),
        downloader.getInstalledModulesDetailed(),
      ]);
      const installed = new Set(
        installedDetailed
          .filter((row) => row.repo.name === repoName)
          .map((row) => row.moduleName),
      );

      return interaction.editReply(
        buildAddonRepoModulesView(
          repoName,
          modules.map((moduleInfo) => ({
            name: moduleInfo.name,
            version: moduleInfo.version,
            short: moduleInfo.short,
            hidden: moduleInfo.hidden,
            isInstalled: installed.has(moduleInfo.name),
          })),
          0,
          t,
        ),
      );
    }

    if (kind === "addon_autoupdate_interval") {
      if (!(await hasOwnerPermit(interaction))) {
        throw new UserError({
          identifier: "AccessDenied",
          message: "Only Bot Owners can manage add-ons.",
        });
      }
      const minutes = Number(interaction.values[0]);
      const downloader = getService("downloader");
      await downloader.setAutoUpdateConfig({ intervalMinutes: minutes });
      const config = await downloader.getAutoUpdateConfig();
      return interaction.editReply(buildAutoUpdateSettingsView(config, t));
    }

    if (kind === "permit_target") {
      if (!interaction.isMentionableSelectMenu())
        return renderPermissions(interaction, 0, t);
      const permitKind = interaction.customId.split(":")[3] as PermitKind;
      const targetId = interaction.values[0];
      if (!targetId) return renderPermissions(interaction, 0, t);
      const targetType: "role" | "user" = interaction.roles.has(targetId)
        ? "role"
        : "user";
      const nodes = collectKnownPermitNodes();
      return interaction.editReply(
        buildPermitNodePickerView(permitKind, targetType, targetId, nodes, t),
      );
    }

    if (kind === "permit_node") {
      const [, , , permitKindRaw, targetTypeRaw, targetId] =
        interaction.customId.split(":");
      const permitKind = permitKindRaw as PermitKind;
      const targetType = targetTypeRaw as "role" | "user";
      const node = interaction.values[0];
      if (node && targetId && (targetType === "role" || targetType === "user")) {
        await (permitKind === "enforced"
          ? this.perms.grantEnforcedPermit(
              interaction.guildId,
              targetType,
              targetId,
              node,
            )
          : this.perms.grantCustomPermit(
              interaction.guildId,
              targetType,
              targetId,
              node,
            )
        ).catch(() => {});
      }
      return renderPermissions(interaction, 0, t);
    }

    return renderPermissions(interaction, 0, t);
  }
}

@ApplyOptions<InteractionHandler.Options>({
  name: "hub-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class HubPanelModalHandler extends InteractionHandler {
  private get settings(): GuildSettingsService {
    return getService("guild-settings");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId === "lumi:prefixmodal")
      return this.some({ kind: "prefix" as const });
    if (interaction.customId.startsWith("lumi:addonmodal:"))
      return this.some({
        kind: "addon" as const,
        action: interaction.customId.split(":")[2],
      });
    return this.none();
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { kind: "prefix" } | { kind: "addon"; action: string },
  ) {
    if (!interaction.inGuild()) return;

    // Defer immediately (before any permit/DB lookups) to beat Discord's 3s
    // ack window. "addon" gets its own ephemeral reply since it doesn't edit
    // the originating panel message; "prefix" edits it in place.
    if (data.kind === "addon") {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      if (!(await hasOwnerPermit(interaction)))
        return interaction.editReply(
          ephemeralCard(
            makeErrorCard("Permission Denied", "Only Bot Owners can manage addons."),
          ),
        );
      return this.#submitAddon(interaction, data.action);
    }

    await interaction.deferUpdate();
    if (!(await hasAdminPermit(interaction)))
      return interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Permission Denied",
            "You need the `admin.*` permit to manage this server.",
          ),
        ),
      );

    return this.#submitPrefix(interaction);
  }

  async #submitPrefix(interaction: ModalSubmitInteraction) {
    const prefix = interaction.fields.getTextInputValue("prefix").trim();
    try {
      await this.settings.setPrefix(interaction.guildId!, prefix);
    } catch (err) {
      return this.#error(interaction, "Invalid Prefix", err);
    }

    const settings = await container.db.config.getGuildSettings(
      interaction.guildId!,
    );
    const t = await fetchTyped(interaction);
    return this.#render(
      interaction,
      buildSettingsView(
        { prefix: settings.prefix, locale: settings.locale },
        t,
      ),
    );
  }

  #render(interaction: ModalSubmitInteraction, view: CardReply) {
    return interaction.editReply(view);
  }

  private get downloader(): DownloaderService {
    return getService("downloader");
  }

  async #submitAddon(interaction: ModalSubmitInteraction, action: string) {
    try {
      if (action === "add_repo") {
        const name = interaction.fields.getTextInputValue("name").trim();
        const url = interaction.fields.getTextInputValue("url").trim();
        const branch =
          interaction.fields.getTextInputValue("branch")?.trim() || "main";
        await this.downloader.addRepo(name, url, branch);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Added",
              `You're all set. **${name}** was added (or refreshed if it already existed).`,
            ),
          ),
        );
      } else if (action === "rm_repo") {
        const name = interaction.fields.getTextInputValue("name").trim();
        await this.downloader.removeRepo(name);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Repository Removed",
              `Removed **${name}** and any modules that were installed from it.`,
            ),
          ),
        );
      } else if (action === "install") {
        const repo = interaction.fields.getTextInputValue("repo").trim();
        const module = interaction.fields.getTextInputValue("module").trim();
        await this.downloader.installModule(repo, module);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Module Installed",
              `Installed **${module}** from **${repo}**. You can now find it in the Modules tab.`,
            ),
          ),
        );
      } else if (action === "uninstall") {
        const module = interaction.fields.getTextInputValue("module").trim();
        await this.downloader.uninstallModule(module);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Module Uninstalled",
              `Uninstalled **${module}** and removed it from active modules.`,
            ),
          ),
        );
      }
    } catch (err) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard(
            "Addon Error",
            err instanceof Error ? err.message : String(err),
          ),
        ),
      );
    }
  }

  #error(interaction: ModalSubmitInteraction, title: string, err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err ?? "Unknown error");
    return interaction.followUp(ephemeralCard(makeErrorCard(title, message)));
  }
}
