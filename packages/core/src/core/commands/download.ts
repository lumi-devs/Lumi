import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import type { DownloaderService } from "#core/services/DownloaderService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "download",
  aliases: ["dl"],
  description:
    "Install or uninstall a module from a repository (Bot Owner Only)",
  permissionLevel: PermissionLevel.BOT_OWNER,
  prefixEnabled: true,
  subcommands: [
    { name: "install", run: "install", default: true },
    { name: "uninstall", run: "uninstall" },
  ],
})
export class DownloadCommand extends BaseSubcommand {
  private get downloaderService(): DownloaderService {
    return getService("downloader");
  }

  public async install(ctx: CommandContext): Promise<void> {
    const repoName = (await ctx.getString("repo", { required: true }))!;
    const moduleName = (await ctx.getString("module", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        "Installing Module",
        `Installing **${moduleName}** from **${repoName}**...`,
      ),
    );

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.info(
        `[Download] ${Emojis.DOWNLOAD} Installed ${moduleName} from ${repoName} by ${ctx.user.tag}`,
      );
      await ctx.reply(
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
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} Failed to Install Module`, msg_),
      );
    }
  }

  public async uninstall(ctx: CommandContext): Promise<void> {
    const moduleName = (await ctx.getString("module", { required: true }))!;

    await ctx.reply(
      makeInfoCard("Uninstalling Module", `Removing **${moduleName}**...`),
    );

    try {
      await this.downloaderService.uninstallModule(moduleName);
      this.container.logger.info(
        `[Download] Uninstalled ${moduleName} by ${ctx.user.tag}`,
      );
      await ctx.reply(
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
      await ctx.reply(makeErrorCard("Failed to Uninstall Module", msg_));
    }
  }
}
