import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import type { AutocompleteInteraction } from "discord.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";
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
import { confirmPrompt } from "#lib/utilities/confirm.js";
import type { DownloaderService } from "#lib/services/DownloaderService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "download",
  aliases: ["dl"],
  description:
    "Install or uninstall a module from a repository (Bot Owner Only)",
  preconditions: ["BotOwner"],
  prefixEnabled: true,
  subcommands: [
    { name: "panel", run: "panel", default: true },
    { name: "install", run: "install" },
    { name: "uninstall", run: "uninstall" },
    { name: "rollback", run: "rollback" },
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
          s.setName("panel").setDescription("Open the Add-ons Manager panel"),
        )
        .addSubcommand((s) =>
          s
            .setName("install")
            .setDescription("Install a module from a repository")
            .addStringOption((o) =>
              o
                .setName("repo")
                .setDescription("Repository name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("Module name")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("revision")
                .setDescription(
                  "Specific commit/branch/tag to install instead of the current HEAD",
                )
                .setRequired(false),
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
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("rollback")
            .setDescription(
              "Check out an installed module to a specific prior revision",
            )
            .addStringOption((o) =>
              o
                .setName("module")
                .setDescription("Module name to roll back")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((o) =>
              o
                .setName("revision")
                .setDescription("Commit/branch/tag to roll back to")
                .setRequired(true),
            ),
        ),
    );
  }

  private get downloaderService(): DownloaderService {
    return getService("downloader");
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "repo") {
      const repos = await this.downloaderService.listRepos();
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(
          repos.map((r) => r.name),
          focused.value,
        ),
      );
    }

    if (focused.name !== "module") return respondWithChoices(interaction, []);

    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand === "install") {
      const repoName = interaction.options.getString("repo");
      if (!repoName) return respondWithChoices(interaction, []);
      try {
        const [modules, installed] = await Promise.all([
          this.downloaderService.getModulesInRepo(repoName),
          this.downloaderService.getInstalledModules(),
        ]);
        const installedNames = new Set(installed.map((m) => m.moduleName));
        const names = modules
          .filter((m) => !m.hidden && !installedNames.has(m.name))
          .map((m) => m.name);
        return respondWithChoices(
          interaction,
          filterAutocompleteChoices(names, focused.value),
        );
      } catch {
        return respondWithChoices(interaction, []);
      }
    }

    const installed = await this.downloaderService.getInstalledModules();
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(
        installed.map((m) => m.moduleName),
        focused.value,
      ),
    );
  }

  public async panel(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const row =
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
    const revision =
      (await ctx.getString("revision", { required: false })) ?? undefined;

    await ctx.reply(
      makeInfoCard(
        t("core:installingModuleTitle"),
        t("core:installingModuleText", { moduleName, repoName }),
      ),
    );

    try {
      await this.downloaderService.installModule(
        repoName,
        moduleName,
        revision,
      );
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
        `[Download] ${Emojis.ERROR} Install failed: ${moduleName} - ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(
          `${Emojis.ERROR} ${t("core:failedInstallModuleTitle")}`,
          msg_,
        ),
      );
    }
  }

  public async uninstall(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const moduleName = (await ctx.getString("module", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        t("core:uninstallingModuleTitle"),
        t("core:uninstallingModuleText", { moduleName }),
      ),
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
        `[Download] Uninstall failed: ${moduleName} - ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(t("core:failedUninstallModuleTitle"), msg_),
      );
    }
  }

  public async rollback(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const moduleName = (await ctx.getString("module", { required: true }))!;
    const revision = (await ctx.getString("revision", { required: true }))!;

    const agreed = await confirmPrompt(ctx, {
      title: `${Emojis.WARNING_SIGN} Rollback Warning`,
      body: [
        `You're about to check out **${moduleName}** to revision \`${revision}\`.`,
        "This runs whatever code exists at that commit inside the bot process. A restart is required to fully apply the change.",
      ].join("\n\n"),
      confirmLabel: "I understand, roll it back",
    });
    if (!agreed) {
      await ctx.reply(
        makeErrorCard("Cancelled", `Module **${moduleName}** was not rolled back.`),
      );
      return;
    }

    await ctx.reply(
      makeInfoCard(
        t("core:rollingBackModuleTitle"),
        t("core:rollingBackModuleText", { moduleName, revision }),
      ),
    );

    try {
      const result = await this.downloaderService.rollbackModule(
        moduleName,
        revision,
      );
      this.container.logger.info(
        `[Download] Rolled back ${moduleName} to ${revision} (${result.commit ?? "unknown"}) by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          t("core:moduleRolledBackTitle"),
          t("core:moduleRolledBackText", {
            moduleName,
            commit: result.commit ?? revision,
          }),
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Download] Rollback failed: ${moduleName} - ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(t("core:failedRollbackModuleTitle"), msg_),
      );
    }
  }
}
