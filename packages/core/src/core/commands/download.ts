import { ApplyOptions } from "@sapphire/decorators";
import { Args } from "@sapphire/framework";
import type { Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeSuccessCard, makeErrorCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";

@ApplyOptions<BaseCommand.Options>({
  name: "download",
  aliases: ["dl"],
  description: "Install a module from a repository (Bot Owner Only)",
  permissionLevel: PermissionLevel.BOT_OWNER,
})
export class DownloadCommand extends BaseCommand {
  private get downloaderService(): import("#core/services/DownloaderService.js").DownloaderService {
    return this.container.stores
      .get("services")
      .get(
        "downloader",
      ) as import("#core/services/DownloaderService.js").DownloaderService;
  }

  public override async messageRun(
    message: Message,
    args: Args,
  ): Promise<void> {
    const repoName = await args.pick("string").catch(() => null);
    const moduleName = await args.pick("string").catch(() => null);

    if (!repoName || !moduleName) {
      await message.reply({
        ...makeErrorCard(
          "Missing Arguments",
          "Usage: `,download <repo> <module>`",
        ),
      });
      return;
    }

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.info(
        `[Download] ${Emojis.DOWNLOAD} Installed ${moduleName} from ${repoName} via message command`,
      );
      await message.reply({
        ...makeSuccessCard(
          `${Emojis.INSTALL} Module Installed`,
          `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
        ),
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.container.logger.warn(
        `[Download] ${Emojis.ERROR} Install failed: ${moduleName} — ${error.message}`,
      );
      await message.reply({
        ...makeErrorCard(
          `${Emojis.ERROR} Failed to Install Module`,
          error.message,
        ),
      });
    }
  }
}
