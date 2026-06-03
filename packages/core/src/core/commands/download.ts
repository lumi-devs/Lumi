import { ApplyOptions } from "@sapphire/decorators";
import { Args } from "@sapphire/framework";
import type { Message } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "download",
  aliases: ["dl"],
  description: "Install or uninstall a module from a repository (Bot Owner Only)",
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "install", messageRun: "messageRunInstall", default: true },
    { name: "uninstall", messageRun: "messageRunUninstall" },
  ],
})
export class DownloadCommand extends BaseSubcommand {
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
          "Usage: `,download <repo> <module>` or `,download install <repo> <module>`",
        ),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard("Installing Module", `Installing **${moduleName}** from **${repoName}**...`),
    );

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.info(
        `[Download] ${Emojis.DOWNLOAD} Installed ${moduleName} from ${repoName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${Emojis.INSTALL} Module Installed`,
          `Successfully installed and loaded **${moduleName}** from **${repoName}**.\nSlash commands (if any) have been synced to Discord.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Download] ${Emojis.ERROR} Install failed: ${moduleName} — ${msg_}`,
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
          "Usage: `,download uninstall <module>`",
        ),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard("Uninstalling Module", `Removing **${moduleName}**...`),
    );

    try {
      await this.downloaderService.uninstallModule(moduleName);
      this.container.logger.info(
        `[Download] Uninstalled ${moduleName} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          "Module Uninstalled",
          `**${moduleName}** has been unloaded and removed.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Download] Uninstall failed: ${moduleName} — ${msg_}`,
      );
      await msg.edit(makeErrorCard("Failed to Uninstall Module", msg_));
    }
  }
}
