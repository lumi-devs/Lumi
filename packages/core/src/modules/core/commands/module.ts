import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { ApplicationCommandRegistry, container } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import {
  type CardReply,
  makeSuccessCard,
  makeErrorCard,
  makeWarningCard,
  makeInfoCard,
} from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import {
  ModuleAlreadyInstalledError,
  type DownloaderService,
} from "#lib/services/DownloaderService.js";
import { restartChoiceRow } from "#lib/restart.js";
import {
  moduleUpdateResultCard,
  type ModuleUpdateResult,
} from "#lib/downloader/cards.js";

type CardReplyHandler = (card: CardReply) => Promise<unknown>;

function getModulePiecesInfo(
  containerInstance: typeof container,
  moduleName: string,
) {
  const piecesByStore: Record<string, string[]> = {};
  let totalPieces = 0;
  for (const store of containerInstance.stores.values()) {
    if (store.name === "modules") continue;
    const pieces = [...store.values()].filter((piece) => {
      const name = containerInstance.moduleStore.moduleNameForLocation(
        piece.location.full,
      );
      return name === moduleName;
    });
    if (pieces.length > 0) {
      piecesByStore[store.name] = pieces.map((p) => p.name);
      totalPieces += pieces.length;
    }
  }
  return { piecesByStore, totalPieces };
}

/** Map a module's runtime state to its status indicator emoji. */
function stateEmoji(state: string | undefined): string {
  if (state === "loaded") return Emojis.SUCCESS;
  if (state === "failed") return Emojis.WARNING;
  return Emojis.CROSS;
}

@ApplyOptions<BaseSubcommand.Options>({
  name: "module",
  description: "Manage system and third-party modules",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  prefixEnabled: true,
  subcommands: [
    { name: "list", run: "list" },
    { name: "info", run: "info" },
    { name: "enable", run: "enable" },
    { name: "disable", run: "disable" },
    { name: "install", run: "install" },
    { name: "uninstall", run: "uninstall" },
    { name: "reload", run: "reloadModuleCmd" },
    { name: "update", run: "update" },
    { name: "help", run: "help", default: true },
  ],
})
export class ModuleCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("list")
            .setDescription("List all discovered modules and their status"),
        )
        .addSubcommand((s) =>
          s
            .setName("info")
            .setDescription("Get detailed information about a module")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("The name of the module")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("enable")
            .setDescription("Enable a module globally")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("The name of the module to enable")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("disable")
            .setDescription("Disable a module globally")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("The name of the module to disable")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("reload")
            .setDescription("Reload a module's source code dynamically")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("The name of the module to reload")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("install")
            .setDescription("Install a third-party module")
            .addStringOption((o) =>
              o
                .setName("repo")
                .setDescription("The repository name")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("The module name")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("uninstall")
            .setDescription("Uninstall a third-party module")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("The module name to uninstall")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("update")
            .setDescription("Update an installed module (or all modules)")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription(
                  "The module name to update (omit to update all)",
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("help")
            .setDescription("Show help message for module command"),
        ),
    );
  }

  public async list(ctx: CommandContext): Promise<void> {
    const records = this.container.moduleStore.all();
    if (!records.length) {
      await ctx.reply(makeInfoCard("Modules", "No modules discovered."));
      return;
    }

    const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name));
    const list = sorted.map((record) => {
      const globalStatus = record.enabled ? "Enabled" : "Disabled";
      const stateLabel = record.state ? `[${record.state}]` : "";
      const isCoreLabel = record.meta.isCore ? " (Core)" : " (Addon)";
      const statusEmoji = stateEmoji(record.state);
      return `${statusEmoji} **${record.meta.emoji} ${record.meta.displayName}** (\`${record.name}\` v${record.meta.version})${isCoreLabel}\n  - Status: ${globalStatus} ${stateLabel}${record.failureReason ? ` (Error: ${record.failureReason})` : ""}`;
    });

    await paginateList({
      interactionOrMessage: ctx.source,
      userId: ctx.user.id,
      title: "Discovered Modules",
      items: list,
      perPage: 5,
    });
  }

  public async info(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const name = (await ctx.getString("module", { required: true }))!;
    const card = this.buildModuleInfoCard(name);
    await ctx.reply(card);
  }

  public async enable(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const name = (await ctx.getString("module", { required: true }))!;
    const result = await this.setModuleEnabledState(name, true);
    await ctx.reply(result);
  }

  public async disable(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const name = (await ctx.getString("module", { required: true }))!;
    const result = await this.setModuleEnabledState(name, false);
    await ctx.reply(result);
  }

  public async install(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const repoName = (await ctx.getString("repo", { required: true }))!;
    const moduleName = (await ctx.getString("module", { required: true }))!;

    if (!ctx.isSlash) {
      await ctx.reply(
        makeInfoCard(
          "Installing Module",
          `Installing **${moduleName}** from **${repoName}**...`,
        ),
      );
    }

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.debug(
        `[Module] ${Emojis.INSTALL} Installed: ${moduleName} from ${repoName} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.INSTALL} Module Installed`,
          `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
        ),
      );
    } catch (err: unknown) {
      await this.handleInstallError(
        err,
        moduleName,
        (c) => ctx.reply(c),
        ctx.user.id,
      );
    }
  }

  public async uninstall(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = (await ctx.getString("module", { required: true }))!;

    if (!ctx.isSlash) {
      await ctx.reply(
        makeInfoCard(
          "Uninstalling Module",
          `Uninstalling **${moduleName}**...`,
        ),
      );
    }

    try {
      await this.downloaderService.uninstallModule(moduleName);
      this.container.logger.debug(
        `[Module] ${Emojis.UNINSTALL} Uninstalled: ${moduleName} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.UNINSTALL} Module Uninstalled`,
          `Successfully uninstalled **${moduleName}**.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Module] ${Emojis.ERROR} Uninstall failed: ${moduleName} - ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} Failed to Uninstall Module`, msg_),
      );
    }
  }

  public async reloadModuleCmd(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = (await ctx.getString("module", { required: true }))!;

    if (!ctx.isSlash) {
      await ctx.reply(
        makeInfoCard(
          "Reloading Module",
          `${Emojis.LOADING} Unloading and reloading **${moduleName}**...`,
        ),
      );
    }

    await this.reloadModule(moduleName, ctx.user.tag, (c) => ctx.reply(c));
  }

  public async update(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = await ctx.getString("module", { required: false });

    if (moduleName) {
      if (!ctx.isSlash) {
        await ctx.reply(
          makeInfoCard(
            "Updating Module",
            `${Emojis.LOADING} Checking and downloading updates for **${moduleName}**...`,
          ),
        );
      }

      try {
        const result = await this.downloaderService.updateModule(moduleName);
        await this.handleUpdateResult(
          result,
          moduleName,
          (c) => ctx.reply(c),
          ctx.user.id,
        );
      } catch (err: unknown) {
        await ctx.reply(
          makeErrorCard(
            `${Emojis.ERROR} Update Failed`,
            errorFrom(err).message,
          ),
        );
      }
    } else {
      if (!ctx.isSlash) {
        await ctx.reply(
          makeInfoCard(
            "Updating All Modules",
            `${Emojis.LOADING} Scanning and updating all installed modules...`,
          ),
        );
      }
      try {
        await this.runAllModulesUpdate((c) => ctx.reply(c), ctx.user.id);
      } catch (err: unknown) {
        await ctx.reply(
          makeErrorCard(
            `${Emojis.ERROR} Multi-Update Failed`,
            errorFrom(err).message,
          ),
        );
      }
    }
  }

  public async help(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const card = this.buildHelpCard();
    await ctx.reply(card);
  }

  private get downloaderService(): DownloaderService {
    return getService("downloader");
  }

  private buildModuleInfoCard(name: string) {
    const record = this.container.moduleStore.getRecord(name);
    if (!record) {
      return makeErrorCard(
        "Not Found",
        `Module **${name}** was not discovered.`,
      );
    }

    const { piecesByStore, totalPieces } = getModulePiecesInfo(
      this.container,
      name,
    );

    const description = record.meta.description || "No description provided.";
    const isCoreLabel = record.meta.isCore ? "Yes (Core)" : "No (Addon)";
    const globalStatus = record.enabled ? "Enabled" : "Disabled";
    const stateLabel = record.state ? `${record.state}` : "unknown";
    const statusEmoji = stateEmoji(record.state);

    const detailLines = [
      `**Display Name:** ${record.meta.displayName}`,
      `**Version:** \`v${record.meta.version}\``,
      `**Core Module:** ${isCoreLabel}`,
      `**Global Toggle:** ${globalStatus}`,
      `**Runtime Status:** ${statusEmoji} \`${stateLabel}\``,
    ];

    if (record.failureReason) {
      detailLines.push(`**Failure Reason:** \`${record.failureReason}\``);
    }

    detailLines.push(
      `**Dependencies:** ${record.meta.dependencies?.length ? record.meta.dependencies.map((d) => `\`${d}\``).join(", ") : "None"}`,
      `**Conflicts:** ${record.meta.conflicts?.length ? record.meta.conflicts.map((c) => `\`${c}\``).join(", ") : "None"}`,
    );

    if (record.meta.configFields?.length) {
      detailLines.push(
        `**Config Fields:**`,
        ...record.meta.configFields.map(
          (f) => `  - \`${f.key}\` (${f.type}): *${f.description || f.label}*`,
        ),
      );
    }

    detailLines.push(`**Registered Pieces:** ${totalPieces} total`);

    for (const [storeName, pieces] of Object.entries(piecesByStore)) {
      detailLines.push(
        `- **${storeName}:** ${pieces.map((p) => `\`${p}\``).join(", ")}`,
      );
    }

    return makeInfoCard(
      `${record.meta.emoji} Module: ${record.meta.displayName} (${record.name})`,
      [`*${description}*`, detailLines.join("\n")].join("\n\n"),
    );
  }

  private async setModuleEnabledState(name: string, enabled: boolean) {
    try {
      const record = this.container.moduleStore.getRecord(name);
      if (!record) {
        return makeErrorCard(
          "Not Found",
          `Module **${name}** was not discovered.`,
        );
      }
      if (!enabled && !this.container.moduleStore.isModuleDisableable(name)) {
        return makeErrorCard(
          "Forbidden",
          `Module **${record.meta.displayName}** is essential and cannot be disabled.`,
        );
      }
      await this.container.moduleStore.setEnabled(name, enabled);
      return makeSuccessCard(
        enabled
          ? `${Emojis.CHECK} Enabled Module`
          : `${Emojis.CROSS} Disabled Module`,
        `Successfully ${enabled ? "enabled" : "disabled"} **${record.meta.displayName}** globally.`,
      );
    } catch (err: unknown) {
      return makeErrorCard("Action Failed", errorFrom(err).message);
    }
  }

  private async handleInstallError(
    err: unknown,
    moduleName: string,
    reply: CardReplyHandler,
    userId: string,
  ) {
    if (err instanceof ModuleAlreadyInstalledError) {
      const updateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`module:update:${moduleName}:${userId}`)
          .setLabel("Update Module")
          .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
          .setStyle(ButtonStyle.Primary),
      );
      await reply(
        makeWarningCard(
          `${Emojis.WARNING} Already Installed`,
          `**${moduleName}** is already installed. Would you like to update it instead?`,
          { actionRows: [updateRow] },
        ),
      );
      return;
    }

    const msg_ = errorFrom(err).message;
    this.container.logger.warn(
      `[Module] ${Emojis.ERROR} Install failed: ${moduleName} - ${msg_}`,
    );
    await reply(
      makeErrorCard(`${Emojis.ERROR} Failed to Install Module`, msg_),
    );
  }

  private async handleUpdateResult(
    result: ModuleUpdateResult,
    moduleName: string,
    reply: CardReplyHandler,
    userId: string,
  ) {
    await reply(moduleUpdateResultCard(result, moduleName, userId));
  }

  private async runAllModulesUpdate(reply: CardReplyHandler, userId: string) {
    const installed = await this.downloaderService.getInstalledModules();
    if (!installed.length) {
      await reply(
        makeWarningCard(
          "No Modules Installed",
          "You have not installed any third-party modules via the Downloader.",
        ),
      );
      return;
    }

    const succeeded: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    let needsRestart = false;

    for (const item of installed) {
      try {
        const result = await this.downloaderService.updateModule(
          item.moduleName,
        );
        if (result.updated) {
          needsRestart ||= result.needsRestart ?? false;
          succeeded.push(
            `${Emojis.SUCCESS} **${item.moduleName}**${result.needsRestart ? "" : " (hot-reloaded)"}`,
          );
        } else {
          skipped.push(`- **${item.moduleName}** (up-to-date)`);
        }
      } catch (err: unknown) {
        failed.push(
          `${Emojis.ERROR} **${item.moduleName}** - ${errorFrom(err).message}`,
        );
      }
    }

    const report: string[] = [];
    if (succeeded.length > 0)
      report.push(`### Updated:\n${succeeded.join("\n")}`);
    if (skipped.length > 0)
      report.push(`### Up-To-Date:\n${skipped.join("\n")}`);
    if (failed.length > 0) report.push(`### Failed:\n${failed.join("\n")}`);
    if (needsRestart) {
      report.push(
        "_New code is on disk. A restart is needed to load it; one restart applies every updated module._",
      );
    }

    await reply(
      makeSuccessCard("Multi-Module Update Report", report.join("\n\n"), {
        actionRows: needsRestart ? [restartChoiceRow(userId)] : undefined,
      }),
    );
  }

  private buildHelpCard() {
    return makeInfoCard(
      "Module Management Commands",
      [
        "**Global & Local Module Commands:**",
        "- `,module list` or `/module list` - List all discovered modules and their status.",
        "- `,module info <name>` or `/module info <name>` - Show detailed info and registered pieces.",
        "- `,module enable <name>` or `/module enable <name>` - Enable a module globally.",
        "- `,module disable <name>` or `/module disable <name>` - Disable a module globally.",
        "- `,module reload <name>` or `/module reload <name>` - Reload a module's source code dynamically.",
        "",
        "**Downloader Commands (Addons):**",
        "- `,module install <repo> <module>` or `/module install` - Install a module from a repo.",
        "- `,module uninstall <module>` or `/module uninstall` - Uninstall a downloader module.",
        "- `,module update [module]` or `/module update` - Update an installed module (or all).",
      ].join("\n"),
    );
  }

  private async reloadModule(
    moduleName: string,
    userTag: string,
    reply: CardReplyHandler,
  ) {
    try {
      await this.container.moduleStore.reload(moduleName);
      await this.downloaderService.syncApplicationCommands();
      this.container.logger.info(
        `[Module] Reloaded: ${moduleName} by ${userTag}`,
      );
      await reply(
        makeSuccessCard(
          `${Emojis.CHECK} Module Reloaded`,
          `**${moduleName}** has been reloaded. Its full source subtree was re-evaluated and slash commands (if any) re-synced.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Module] Reload failed: ${moduleName} - ${msg_}`,
      );
      await reply(makeErrorCard(`${Emojis.ERROR} Reload Failed`, msg_));
    }
  }
}
