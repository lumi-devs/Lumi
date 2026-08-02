import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
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
  name: "repo",
  description: "Manage third-party module repositories",
  preconditions: ["GuildOnly"],
  requiredPermit: "owner.*",
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
                .setName("name")
                .setDescription("Unique repo name")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("url")
                .setDescription("Git clone URL")
                .setRequired(true),
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
                .setRequired(true),
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
                .setRequired(true),
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
                .setRequired(true),
            ),
        ),
    );
  }

  private get downloaderService(): DownloaderService {
    return getService("downloader");
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
          "- `,repo add <name> <url> [branch]`",
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
    const name = (await ctx.getString("name", { required: true }))!;
    const url = (await ctx.getString("url", { required: true }))!;
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
      await ctx.reply(
        makeErrorCard("Cancelled", `Repository **${name}** was not added.`),
      );
      return;
    }

    await ctx.reply(
      makeInfoCard(
        t("core:addingRepoTitle"),
        t("core:addingRepoText", { name }),
      ),
    );

    try {
      await this.downloaderService.addRepo(name, url, branch);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Added repository: ${name} (${url}@${branch}) by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.REPO} ${t("core:repoAddedTitle")}`,
          t("core:repoAddedText", { name }),
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to add repo: ${name} - ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} ${t("core:failedAddRepoTitle")}`, msg_),
      );
    }
  }

  public async remove(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        t("core:removingRepoTitle"),
        t("core:removingRepoText", { name }),
      ),
    );

    try {
      await this.downloaderService.removeRepo(name);
      this.container.logger.info(
        `[Repo] Removed repository: ${name} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.REPO} ${t("core:repoRemovedTitle")}`,
          t("core:repoRemovedText", { name }),
        ),
      );
    } catch (err: unknown) {
      await ctx.reply(
        makeErrorCard(t("core:failedRemoveRepoTitle"), errorFrom(err).message),
      );
    }
  }

  public async update(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const name = (await ctx.getString("name", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        t("core:updatingRepoTitle"),
        t("core:updatingRepoText", { name }),
      ),
    );

    try {
      await this.downloaderService.updateRepo(name);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Updated repository: ${name} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.REPO} ${t("core:repoUpdatedTitle")}`,
          t("core:repoUpdatedText", { name }),
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to update repo: ${name} - ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(
          `${Emojis.ERROR} ${t("core:failedUpdateRepoTitle")}`,
          msg_,
        ),
      );
    }
  }

  public async list(ctx: CommandContext): Promise<void> {
    const t = await ctx.fetchT();
    const repos = await this.downloaderService.listRepos();
    if (!repos.length) {
      await ctx.reply(
        makeErrorCard(t("core:noReposTitle"), t("core:noReposText")),
      );
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
    const repoName = (await ctx.getString("repo", { required: true }))!;

    try {
      const [modules, installed] = await Promise.all([
        this.downloaderService.getModulesInRepo(repoName),
        this.downloaderService.getInstalledModules(),
      ]);

      if (!modules.length) {
        await ctx.reply(
          makeErrorCard(
            t("core:noModulesFoundTitle"),
            t("core:noModulesFoundText", { repoName }),
          ),
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
      await ctx.reply(
        makeErrorCard(t("core:failedReadRepoTitle"), errorFrom(err).message),
      );
    }
  }
}
