import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, type Message } from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeWarningCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import { ModuleAlreadyInstalledError } from "#core/services/DownloaderService.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "module",
  description: "Manage installation of third-party modules",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "install", messageRun: "messageRunInstall" },
    { name: "uninstall", messageRun: "messageRunUninstall" },
    { name: "update", messageRun: "messageRunUpdate" },
    { name: "help", messageRun: "messageRunHelp", default: true },
  ],
})
export class ModuleCommand extends EmberSubcommand {
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
        `[Module] ${EmberEmojis.INSTALL} Installed: ${moduleName} from ${repoName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${EmberEmojis.INSTALL} Module Installed`,
          `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
        ),
      );
    } catch (err: unknown) {
      if (err instanceof ModuleAlreadyInstalledError) {
        const updateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`module:update:${moduleName}:${message.author.id}`)
            .setLabel("Update Module")
            .setEmoji(EmberEmojis.parse(EmberEmojis.DOWNLOAD))
            .setStyle(ButtonStyle.Primary),
        );
        await msg.edit(
          makeWarningCard(
            `${EmberEmojis.WARNING} Already Installed`,
            `**${moduleName}** is already installed. Would you like to update it instead?`,
            { actionRows: [updateRow] },
          ),
        );
        return;
      }

      const error = err as Error;
      this.container.logger.warn(
        `[Module] ${EmberEmojis.ERROR} Install failed: ${moduleName} — ${error.message}`,
      );
      await msg.edit(
        makeErrorCard(
          `${EmberEmojis.ERROR} Failed to Install Module`,
          error.message,
        ),
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
        `[Module] ${EmberEmojis.UNINSTALL} Uninstalled: ${moduleName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${EmberEmojis.UNINSTALL} Module Uninstalled`,
          `Successfully uninstalled **${moduleName}**.`,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.container.logger.warn(
        `[Module] ${EmberEmojis.ERROR} Uninstall failed: ${moduleName} — ${error.message}`,
      );
      await msg.edit(
        makeErrorCard(
          `${EmberEmojis.ERROR} Failed to Uninstall Module`,
          error.message,
        ),
      );
    }
  }

  public async messageRunHelp(message: Message): Promise<void> {
    await message.reply(
      makeInfoCard(
        "Module Management",
        "Available subcommands:\n- `,module install <repo> <module>`\n- `,module uninstall <module>`\n- `,module update [module]`",
      ),
    );
  }

  public async messageRunUpdate(message: Message, args: Args): Promise<void> {
    const moduleName = await args.pick("string").catch(() => null);

    if (moduleName) {
      const msg = await message.reply(
        makeInfoCard(
          "Updating Module",
          `${EmberEmojis.LOADING} Checking and downloading updates for **${moduleName}**...`,
        ),
      );

      try {
        const result = await this.downloaderService.updateModule(moduleName);
        if (result.updated) {
          const changelogStr = result.changelog
            ? `### Pull Changelog:\n\`\`\`git\n${result.changelog}\n\`\`\``
            : "No changelog details provided.";

          await msg.edit(
            makeSuccessCard(
              `${EmberEmojis.DOWNLOAD} Module Updated`,
              `Successfully updated and hot-reloaded **${moduleName}**!\n\n${changelogStr}`,
            ),
          );
        } else {
          await msg.edit(
            makeSuccessCard(
              `${EmberEmojis.CHECK} Module Up-To-Date`,
              `**${moduleName}** is already running the latest version!`,
            ),
          );
        }
      } catch (err: unknown) {
        const error = err as Error;
        await msg.edit(
          makeErrorCard(`${EmberEmojis.ERROR} Update Failed`, error.message),
        );
      }
    } else {
      const msg = await message.reply(
        makeInfoCard(
          "Updating All Modules",
          `${EmberEmojis.LOADING} Scanning and updating all installed modules...`,
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

        for (const item of installed) {
          try {
            const result = await this.downloaderService.updateModule(
              item.moduleName,
            );
            if (result.updated) {
              succeeded.push(`✅ **${item.moduleName}** (hot-reloaded)`);
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

        await msg.edit(
          makeSuccessCard("Multi-Module Update Report", report.join("\n\n")),
        );
      } catch (err: unknown) {
        const error = err as Error;
        await msg.edit(
          makeErrorCard(
            `${EmberEmojis.ERROR} Multi-Update Failed`,
            error.message,
          ),
        );
      }
    }
  }
}
