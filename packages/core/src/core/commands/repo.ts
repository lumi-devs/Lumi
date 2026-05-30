import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import type { Message } from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeListCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "repo",
  description: "Manage third-party module repositories",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "add", messageRun: "messageRunAdd" },
    { name: "list", messageRun: "messageRunList" },
    { name: "modules", messageRun: "messageRunModules" },
    { name: "help", messageRun: "messageRunHelp", default: true },
  ],
})
export class RepoCommand extends BaseSubcommand {
  private get downloaderService(): import("#core/services/DownloaderService.js").DownloaderService {
    return this.container.stores
      .get("services")
      .get(
        "downloader",
      ) as import("#core/services/DownloaderService.js").DownloaderService;
  }

  public async messageRunHelp(message: Message): Promise<void> {
    await message.reply(
      makeInfoCard(
        "Repository Management",
        "Available subcommands:\n- `,repo add <name> <url> [branch]`\n- `,repo list`\n- `,repo modules <repo_name>`",
      ),
    );
  }

  public async messageRunAdd(message: Message, args: Args): Promise<void> {
    const name = await args.pick("string").catch(() => null);
    const url = await args.pick("string").catch(() => null);
    const branch = await args.pick("string").catch(() => "default");

    if (!name || !url) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,repo add <name> <url> [branch]`",
        ),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard("Adding Repository", `Cloning/updating **${name}**...`),
    );

    try {
      await this.downloaderService.addRepo(name, url, branch);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Added repository: ${name} (${url}@${branch}) by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${Emojis.REPO} Repository Added`,
          `Successfully cloned/updated repository **${name}**.\nYou can now use \`,repo modules ${name}\` to view available modules.`,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to add repo: ${name} — ${error.message}`,
      );
      await msg.edit(
        makeErrorCard(
          `${Emojis.ERROR} Failed to Add Repository`,
          error.message,
        ),
      );
    }
  }

  public async messageRunList(message: Message): Promise<void> {
    const repos = await this.downloaderService.listRepos();
    if (!repos.length) {
      await message.reply(
        makeErrorCard(
          "No Repositories",
          "No third-party repositories have been added yet.",
        ),
      );
      return;
    }

    const list = repos.map(
      (r: import("@prisma/client").DownloaderRepo) =>
        `**${r.name}** (\`${r.branch}\`)\n<${r.url}>`,
    );
    await message.reply(makeListCard("Added Repositories", list));
  }

  public async messageRunModules(message: Message, args: Args): Promise<void> {
    const repoName = await args.pick("string").catch(() => null);

    if (!repoName) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,repo modules <repo_name>`",
        ),
      );
      return;
    }

    try {
      const modules = await this.downloaderService.getModulesInRepo(repoName);

      if (!modules.length) {
        await message.reply(
          makeErrorCard(
            "No Modules Found",
            `Repository **${repoName}** contains no discoverable modules with an \`info.json\` file.`,
          ),
        );
        return;
      }

      const list = modules.map(
        (m) => `**${m.name}** (v${m.version})\n*${m.short}*`,
      );
      await message.reply(makeListCard(`Modules in ${repoName}`, list));
    } catch (err: unknown) {
      const error = err as Error;
      await message.reply(
        makeErrorCard("Failed to Read Repository", error.message),
      );
    }
  }
}
