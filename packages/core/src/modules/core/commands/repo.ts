import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import type { DownloaderService } from "#lib/services/DownloaderService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "repo",
  description: "Manage third-party module repositories",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
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
  private get downloaderService(): DownloaderService {
    return getService("downloader");
  }

  public async help(ctx: CommandContext): Promise<void> {
    await ctx.reply(
      makeInfoCard(
        "Repository Management",
        [
          "- `,repo add <name> <url> [branch]`",
          "- `,repo remove <name>`",
          "- `,repo update <name>`",
          "- `,repo list`",
          "- `,repo modules <repo_name>`",
        ].join("\n"),
      ),
    );
  }

  public async add(ctx: CommandContext): Promise<void> {
    const name = (await ctx.getString("name", { required: true }))!;
    const url = (await ctx.getString("url", { required: true }))!;
    const branch =
      (await ctx.getString("branch", { required: false })) ?? "default";

    await ctx.reply(
      makeInfoCard("Adding Repository", `Cloning/updating **${name}**...`),
    );

    try {
      await this.downloaderService.addRepo(name, url, branch);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Added repository: ${name} (${url}@${branch}) by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.REPO} Repository Added`,
          `Successfully cloned/updated repository **${name}**.\nYou can now use \`,repo modules ${name}\` to view available modules.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to add repo: ${name} — ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} Failed to Add Repository`, msg_),
      );
    }
  }

  public async remove(ctx: CommandContext): Promise<void> {
    const name = (await ctx.getString("name", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        "Removing Repository",
        `Removing **${name}** and its installed modules...`,
      ),
    );

    try {
      await this.downloaderService.removeRepo(name);
      this.container.logger.info(
        `[Repo] Removed repository: ${name} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.REPO} Repository Removed`,
          `Repository **${name}** and all its installed modules have been removed.`,
        ),
      );
    } catch (err: unknown) {
      await ctx.reply(
        makeErrorCard("Failed to Remove Repository", errorFrom(err).message),
      );
    }
  }

  public async update(ctx: CommandContext): Promise<void> {
    const name = (await ctx.getString("name", { required: true }))!;

    await ctx.reply(
      makeInfoCard(
        "Updating Repository",
        `Pulling latest changes for **${name}**...`,
      ),
    );

    try {
      await this.downloaderService.updateRepo(name);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Updated repository: ${name} by ${ctx.user.tag}`,
      );
      await ctx.reply(
        makeSuccessCard(
          `${Emojis.REPO} Repository Updated`,
          `Successfully updated repository **${name}** to the latest commit.`,
        ),
      );
    } catch (err: unknown) {
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to update repo: ${name} — ${msg_}`,
      );
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} Failed to Update Repository`, msg_),
      );
    }
  }

  public async list(ctx: CommandContext): Promise<void> {
    const repos = await this.downloaderService.listRepos();
    if (!repos.length) {
      await ctx.reply(
        makeErrorCard(
          "No Repositories",
          "No third-party repositories have been added yet.",
        ),
      );
      return;
    }

    const list = repos.map(
      (r) => `**${r.name}** (\`${r.branch}\`)\n<${r.url}>`,
    );
    await paginateList({
      interactionOrMessage: ctx.source,
      userId: ctx.user.id,
      title: "Added Repositories",
      items: list,
      perPage: 5,
    });
  }

  public async modules(ctx: CommandContext): Promise<void> {
    const repoName = (await ctx.getString("repo", { required: true }))!;

    try {
      const [modules, installed] = await Promise.all([
        this.downloaderService.getModulesInRepo(repoName),
        this.downloaderService.getInstalledModules(),
      ]);

      if (!modules.length) {
        await ctx.reply(
          makeErrorCard(
            "No Modules Found",
            `Repository **${repoName}** contains no discoverable modules with an \`info.json\` file.`,
          ),
        );
        return;
      }

      const installedNames = new Set(installed.map((m) => m.moduleName));
      const list = modules
        .filter((m) => !m.hidden)
        .map((m) => {
          const badge = installedNames.has(m.name) ? " ✓ installed" : "";
          return `**${m.name}** (v${m.version})${badge}\n*${m.short}*`;
        });
      await paginateList({
        interactionOrMessage: ctx.source,
        userId: ctx.user.id,
        title: `Modules in ${repoName}`,
        items: list,
        perPage: 5,
      });
    } catch (err: unknown) {
      await ctx.reply(
        makeErrorCard("Failed to Read Repository", errorFrom(err).message),
      );
    }
  }
}
