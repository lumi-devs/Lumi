import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import type { Message } from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "module",
  description: "Manage installation of third-party modules",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "install", messageRun: "messageRunInstall" },
    { name: "uninstall", messageRun: "messageRunUninstall" },
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
}
