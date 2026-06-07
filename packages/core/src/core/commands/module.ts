import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, type Message } from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeWarningCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import { ModuleAlreadyInstalledError } from "#core/services/DownloaderService.js";
import { restartChoiceRow } from "#core/lib/restart.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "module",
  description: "Manage installation of third-party modules",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "install", messageRun: "messageRunInstall" },
    { name: "uninstall", messageRun: "messageRunUninstall" },
    { name: "update", messageRun: "messageRunUpdate" },
    { name: "reload", messageRun: "messageRunReload" },
    { name: "help", messageRun: "messageRunHelp", default: true },
  ],
})
export class ModuleCommand extends BaseSubcommand {
  private get downloaderService(): import("#core/services/DownloaderService.js").DownloaderService {
    return this.container.stores
      .get("services")
      .get(
        "downloader",
      ) as import("#core/services/DownloaderService.js").DownloaderService;
  }

  public async messageRunInstall(message: Message, args: Args): Promise<void> {
    const repoName = await args.pick("string").catch(() => null);
    const moduleName = await args.pick("string").catch(() => null);

    if (!repoName || !moduleName) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,module install <repo> <module>`",
        ),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard(
        "Installing Module",
        `Installing **${moduleName}** from **${repoName}**...`,
      ),
    );

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.debug(
        `[Module] ${Emojis.INSTALL} Installed: ${moduleName} from ${repoName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${Emojis.INSTALL} Module Installed`,
          `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
        ),
      );
    } catch (err: unknown) {
      if (err instanceof ModuleAlreadyInstalledError) {
        const updateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`module:update:${moduleName}:${message.author.id}`)
            .setLabel("Update Module")
            .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
            .setStyle(ButtonStyle.Primary),
        );
        await msg.edit(
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
        `[Module] ${Emojis.ERROR} Install failed: ${moduleName} — ${msg_}`,
      );
      await msg.edit(
        makeErrorCard(`${Emojis.ERROR} Failed to Install Module`, msg_),
      );
    }
  }

  public async messageRunUninstall(
    message: Message,
    args: Args,
  ): Promise<void> {
    const moduleName = await args.pick("string").catch(() => null);

    if (!moduleName) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,module uninstall <module>`",
        ),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard("Uninstalling Module", `Uninstalling **${moduleName}**...`),
    );

    try {
      await this.downloaderService.uninstallModule(moduleName);
      this.container.logger.debug(
        `[Module] ${Emojis.UNINSTALL} Uninstalled: ${moduleName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${Emojis.UNINSTALL} Module Uninstalled`,
          `Successfully uninstalled **${moduleName}**.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Module] ${Emojis.ERROR} Uninstall failed: ${moduleName} — ${msg_}`,
      );
      await msg.edit(
        makeErrorCard(`${Emojis.ERROR} Failed to Uninstall Module`, msg_),
      );
    }
  }

  public async messageRunReload(message: Message, args: Args): Promise<void> {
    const moduleName = await args.pick("string").catch(() => null);

    if (!moduleName) {
      await message.reply(
        makeErrorCard("Missing Arguments", "Usage: `,module reload <module>`"),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard(
        "Reloading Module",
        `${Emojis.LOADING} Unloading and reloading **${moduleName}**...`,
      ),
    );

    try {
      await this.container.moduleStore.reload(moduleName);
      await this.downloaderService.syncApplicationCommands();
      this.container.logger.info(
        `[Module] Reloaded: ${moduleName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${Emojis.CHECK} Module Reloaded`,
          `**${moduleName}** has been reloaded. Its full source subtree was re-evaluated and slash commands (if any) re-synced.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Module] Reload failed: ${moduleName} — ${msg_}`,
      );
      await msg.edit(makeErrorCard(`${Emojis.ERROR} Reload Failed`, msg_));
    }
  }

  public async messageRunHelp(message: Message): Promise<void> {
    await message.reply(
      makeInfoCard(
        "Module Management",
        [
          "- `,module install <repo> <module>`",
          "- `,module uninstall <module>`",
          "- `,module update [module]`",
          "- `,module reload <module>`",
        ].join("\n"),
      ),
    );
  }

  public async messageRunUpdate(message: Message, args: Args): Promise<void> {
    const moduleName = await args.pick("string").catch(() => null);

    if (moduleName) {
      const msg = await message.reply(
        makeInfoCard(
          "Updating Module",
          `${Emojis.LOADING} Checking and downloading updates for **${moduleName}**...`,
        ),
      );

      try {
        const result = await this.downloaderService.updateModule(moduleName);
        if (result.updated) {
          const changelogStr = result.changelog
            ? `### Pull Changelog:\n\`\`\`git\n${result.changelog}\n\`\`\``
            : "No changelog details provided.";

          if (result.needsRestart) {
            await msg.edit(
              makeSuccessCard(
                `${Emojis.DOWNLOAD} Module Updated`,
                `Updated **${moduleName}** on disk. Bun can't hot-swap module code, so a restart is needed to load it.\n\n${changelogStr}`,
                { actionRows: [restartChoiceRow(message.author.id)] },
              ),
            );
          } else {
            await msg.edit(
              makeSuccessCard(
                `${Emojis.DOWNLOAD} Module Updated`,
                `Successfully updated and hot-reloaded **${moduleName}**!\n\n${changelogStr}`,
              ),
            );
          }
        } else {
          await msg.edit(
            makeSuccessCard(
              `${Emojis.CHECK} Module Up-To-Date`,
              `**${moduleName}** is already running the latest version!`,
            ),
          );
        }
      } catch (err: unknown) {
        await msg.edit(
          makeErrorCard(`${Emojis.ERROR} Update Failed`, errorFrom(err).message),
        );
      }
    } else {
      const msg = await message.reply(
        makeInfoCard(
          "Updating All Modules",
          `${Emojis.LOADING} Scanning and updating all installed modules...`,
        ),
      );

      try {
        const installed = await this.downloaderService.getInstalledModules();
        if (!installed.length) {
          await msg.edit(
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
                `✅ **${item.moduleName}**${result.needsRestart ? "" : " (hot-reloaded)"}`,
              );
            } else {
              skipped.push(`➖ **${item.moduleName}** (up-to-date)`);
            }
          } catch (err: unknown) {
            failed.push(
              `❌ **${item.moduleName}** — ${errorFrom(err).message}`,
            );
          }
        }

        const report: string[] = [];
        if (succeeded.length > 0)
          report.push(`### Updated:\n${succeeded.join("\n")}`);
        if (skipped.length > 0)
          report.push(`### Up-To-Date:\n${skipped.join("\n")}`);
        if (failed.length > 0) report.push(`### Failed:\n${failed.join("\n")}`);
        if (needsRestart)
          report.push(
            "_New code is on disk. A restart is needed to load it — one restart applies every updated module._",
          );

        await msg.edit(
          makeSuccessCard("Multi-Module Update Report", report.join("\n\n"), {
            actionRows: needsRestart
              ? [restartChoiceRow(message.author.id)]
              : undefined,
          }),
        );
      } catch (err: unknown) {
        await msg.edit(
          makeErrorCard(`${Emojis.ERROR} Multi-Update Failed`, errorFrom(err).message),
        );
      }
    }
  }
}
