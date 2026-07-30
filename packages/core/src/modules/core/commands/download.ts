import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import type { DownloaderService } from "#lib/services/DownloaderService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "download",
  aliases: ["dl"],
  description:
    "Install or uninstall a module from a repository (Bot Owner Only)",
  requiredPermit: "owner.*",
  prefixEnabled: true,
  subcommands: [
    { name: "panel", run: "panel", default: true },
    { name: "install", run: "install" },
    { name: "uninstall", run: "uninstall" },
  ],
})
export class DownloadCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("panel")
            .setDescription("Open the Add-ons Manager panel"),
        )
        .addSubcommand((s) =>
          s
            .setName("install")
            .setDescription("Install a module from a repository")
            .addStringOption((o) =>
              o
                .setName("repo")
                .setDescription("Repository name")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("Module name")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("uninstall")
            .setDescription("Uninstall an installed module")
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("Module name to uninstall")
                .setRequired(true),
            ),
        ),
    );
  }

  private get downloaderService(): DownloaderService {
    return getService("downloader");
  }

  public async panel(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("lumi:tab:addons")
        .setLabel(t("core:openAddonsManager"))
        .setEmoji(Emojis.parse(Emojis.REPO))
        .setStyle(ButtonStyle.Primary),
    );

    await ctx.reply(
      makeInfoCard(
        t("core:addonDownloadsTitle"),
        t("core:addonDownloadsText"),
        { actionRows: [row] },
      ),
    );
  }

  public async install(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const repoName = (await ctx.getString("repo", { required: true }))!;
    const moduleName = (await ctx.getString("module", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        t("core:installingModuleTitle"),
        t("core:installingModuleText", { moduleName, repoName }),
      ),
    );

    try {
      await this.downloaderService.installModule(repoName, moduleName);
      this.container.logger.info(
        `[Download] ${Emojis.DOWNLOAD} Installed ${moduleName} from ${repoName} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.INSTALL} ${t("core:moduleInstalledTitle")}`,
          t("core:moduleInstalledText", { moduleName, repoName }),
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Download] ${Emojis.ERROR} Install failed: ${moduleName} — ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} ${t("core:failedInstallModuleTitle")}`, msg_),
      );
    }
  }

  public async uninstall(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const moduleName = (await ctx.getString("module", { required: true }))!;

    await ctx.reply(
      makeInfoCard(t("core:uninstallingModuleTitle"), t("core:uninstallingModuleText", { moduleName })),
    );

    try {
      await this.downloaderService.uninstallModule(moduleName);
      this.container.logger.info(
        `[Download] Uninstalled ${moduleName} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          t("core:moduleUninstalledTitle"),
          t("core:moduleUninstalledText", { moduleName }),
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Download] Uninstall failed: ${moduleName} — ${msg_}`,
      );
      await ctx.reply(makeErrorCard(t("core:failedUninstallModuleTitle"), msg_));
    }
  }
}
