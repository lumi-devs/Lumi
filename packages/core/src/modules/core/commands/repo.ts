import { ApplyOptions } from "@sapphire/decorators";
import { deriveRepoNameFromUrl } from "#lib/downloader/url-helpers.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import type { AutocompleteInteraction } from "discord.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { respondWithChoices } from "#lib/utilities/autocomplete.js";
import { repoNameChoices } from "#lib/downloader/autocomplete.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { makeInfoCard } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import type { DownloaderUtility } from "#utilities/DownloaderUtility.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "repo",
  description: "Manage third-party module repositories",
  preconditions: ["GuildOnly", "BotOwner"],
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add" },
    { name: "remove", run: "remove" },
    { name: "update", run: "update" },
    { name: "list", run: "list" },
    { name: "modules", run: "modules" },
    { name: "help", run: "help", default: true },
  ],
})
export class RepoCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("help")
            .setDescription("Open Repository Management help and panel"),
        )
        .addSubcommand((s) =>
          s.setName("list").setDescription("List all added repositories"),
        )
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Add a repository")
            .addStringOption((o) =>
              o
                .setName("url")
                .setDescription("Git clone URL")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription(
                  "Unique repo name (optional - derived from the URL if omitted)",
                )
                .setRequired(false),
            )
            .addStringOption((o) =>
              o
                .setName("branch")
                .setDescription("Branch name (default: default)")
                .setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove an added repository")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Repo name to remove")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("update")
            .setDescription("Update/pull latest changes for a repository")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Repo name to update (or 'all')")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("modules")
            .setDescription("List available modules inside a repository")
            .addStringOption((o) =>
              o
                .setName("repo_name")
                .setDescription("Repository name")
                .setRequired(true)
                .setAutocomplete(true),
            ),
        ),
    );
  }

  private get downloaderService(): DownloaderUtility {
    return getUtility("downloader");
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "name" && focused.name !== "repo_name") {
      return respondWithChoices(interaction, []);
    }

    const extra =
      focused.name === "name" &&
      interaction.options.getSubcommand(false) === "update"
        ? ["all"]
        : undefined;
    return respondWithChoices(
      interaction,
      await repoNameChoices(this.downloaderService, focused.value, { extra }),
    );
  }

  public async help(ctx: CommandContext): Promise<void> {
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
        t("core:repoManagementTitle"),
        [
          "Use the Add-ons Manager for the smoothest workflow: browse repositories, inspect modules, and install in a few clicks.",
          "Quick command fallback:",
          "- `,repo add <url> [name] [branch]` (name is derived from the URL if omitted)",
          "- `,repo remove <name>`",
          "- `,repo update <name>`",
          "- `,repo list`",
          "- `,repo modules <repo_name>`",
        ],
        {
          actionRows: [row],
        },
      ),
    );
  }

  public async add(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const url = (await ctx.getString("url", { required: true }))!;
    const rawName = await ctx.getString("name", { required: false });
    const name = rawName || deriveRepoNameFromUrl(url);
    const branch =
      (await ctx.getString("branch", { required: false })) ?? "default";

    const agreed = await confirmPrompt(ctx, {
      title: `${Emojis.WARNING_SIGN} Third-Party Code Warning`,
      body: [
        `You're about to clone **${name}** (\`${url}\`) as a module repository.`,
        "Modules installed from it run **inside the bot process** with full access to its database, cache, and Discord client. Lumi does not review or vet third-party repositories.",
        "Only add repositories from sources you trust.",
      ].join("\n\n"),
      confirmLabel: "I understand, add it",
    });
    if (!agreed) {
      await ctx.replyError("Cancelled", `Repository **${name}** was not added.`);
      return;
    }

    await ctx.replyInfo(
      t("core:addingRepoTitle"),
      t("core:addingRepoText", { name }),
    );

    try {
      await this.downloaderService.addRepo(name, url, branch);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Added repository: ${name} (${url}@${branch}) by ${ctx.user.tag}`,
      );
      await ctx.replySuccess(
        `${Emojis.REPO} ${t("core:repoAddedTitle")}`,
        t("core:repoAddedText", { name }),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to add repo: ${name} - ${msg_}`,
      );
      await ctx.replyError(`${Emojis.ERROR} ${t("core:failedAddRepoTitle")}`, msg_);
    }
  }

  public async remove(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!;

    await ctx.replyInfo(
      t("core:removingRepoTitle"),
      t("core:removingRepoText", { name }),
    );

    try {
      await this.downloaderService.removeRepo(name);
      this.container.logger.info(
        `[Repo] Removed repository: ${name} by ${ctx.user.tag}`,
      );
      await ctx.replySuccess(
        `${Emojis.REPO} ${t("core:repoRemovedTitle")}`,
        t("core:repoRemovedText", { name }),
      );
    } catch (err: unknown) {
      await ctx.replyError(t("core:failedRemoveRepoTitle"), errorFrom(err).message);
    }
  }

  public async update(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!;

    await ctx.replyInfo(
      t("core:updatingRepoTitle"),
      t("core:updatingRepoText", { name }),
    );

    try {
      await this.downloaderService.updateRepo(name);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Updated repository: ${name} by ${ctx.user.tag}`,
      );
      await ctx.replySuccess(
        `${Emojis.REPO} ${t("core:repoUpdatedTitle")}`,
        t("core:repoUpdatedText", { name }),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to update repo: ${name} - ${msg_}`,
      );
      await ctx.replyError(
        `${Emojis.ERROR} ${t("core:failedUpdateRepoTitle")}`,
        msg_,
      );
    }
  }

  public async list(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const repos = await this.downloaderService.listRepos();
    if (!repos.length) {
      await ctx.replyError(t("core:noReposTitle"), t("core:noReposText"));
      return;
    }

    const list = repos.map(
      (r) => `**${r.name}** (\`${r.branch}\`)\n<${r.url}>`,
    );
    await paginateList({
      interactionOrMessage: ctx.source,
      userId: ctx.user.id,
      title: t("core:addedReposTitle"),
      items: list,
      perPage: 5,
    });
  }

  public async modules(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const repoName = (await ctx.getString("repo_name", { required: true }))!;

    try {
      const [modules, installed] = await Promise.all([
        this.downloaderService.getModulesInRepo(repoName),
        this.downloaderService.getInstalledModules(),
      ]);

      if (!modules.length) {
        await ctx.replyError(
          t("core:noModulesFoundTitle"),
          t("core:noModulesFoundText", { repoName }),
        );
        return;
      }

      const installedNames = new Set(installed.map((m) => m.moduleName));
      const list = modules
        .filter((m) => !m.hidden)
        .map((m) => {
          const badge = installedNames.has(m.name)
            ? t("core:installedBadge")
            : "";
          return `**${m.name}** (v${m.version})${badge}\n*${m.short}*`;
        });
      await paginateList({
        interactionOrMessage: ctx.source,
        userId: ctx.user.id,
        title: t("core:modulesInRepoTitle", { repoName }),
        items: list,
        perPage: 5,
      });
    } catch (err: unknown) {
      await ctx.replyError(t("core:failedReadRepoTitle"), errorFrom(err).message);
    }
  }
}
