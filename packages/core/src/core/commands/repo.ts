import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
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
import { errorFrom } from "#utilities/errors.js";
import type { DownloaderService } from "#core/services/DownloaderService.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "repo",
  description: "Manage third-party module repositories",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "add", messageRun: "messageRunAdd" },
    { name: "remove", messageRun: "messageRunRemove" },
    { name: "update", messageRun: "messageRunUpdate" },
    { name: "list", messageRun: "messageRunList" },
    { name: "modules", messageRun: "messageRunModules" },
    { name: "help", messageRun: "messageRunHelp", default: true },
  ],
})
export class RepoCommand extends BaseSubcommand {
  private get downloaderService(): DownloaderService {
    return getService("downloader");
  }

  public async messageRunHelp(message: Message): Promise<void> {
    await message.reply(
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
      const msg_ = errorFrom(err).message;
      this.container.logger.warn(
        `[Repo] ${Emojis.ERROR} Failed to add repo: ${name} — ${msg_}`,
      );
      await msg.edit(
        makeErrorCard(`${Emojis.ERROR} Failed to Add Repository`, msg_),
      );
    }
  }

  public async messageRunRemove(message: Message, args: Args): Promise<void> {
    const name = await args.pick("string").catch(() => null);

    if (!name) {
      await message.reply(
        makeErrorCard("Missing Arguments", "Usage: `,repo remove <name>`"),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard(
        "Removing Repository",
        `Removing **${name}** and its installed modules...`,
      ),
    );

    try {
      await this.downloaderService.removeRepo(name);
      this.container.logger.info(
        `[Repo] Removed repository: ${name} by ${message.author.tag}`,
      );
      await msg.edit(
        makeSuccessCard(
          `${Emojis.REPO} Repository Removed`,
          `Repository **${name}** and all its installed modules have been removed.`,
        ),
      );
    } catch (err: unknown) {
      await msg.edit(
        makeErrorCard("Failed to Remove Repository", errorFrom(err).message),
      );
    }
  }

  public async messageRunUpdate(message: Message, args: Args): Promise<void> {
    const name = await args.pick("string").catch(() => null);

    if (!name) {
      await message.reply(
        makeErrorCard("Missing Arguments", "Usage: `,repo update <name>`"),
      );
      return;
    }

    const msg = await message.reply(
      makeInfoCard(
        "Updating Repository",
        `Pulling latest changes for **${name}**...`,
      ),
    );

    try {
      await this.downloaderService.updateRepo(name);
      this.container.logger.info(
        `[Repo] ${Emojis.REPO} Updated repository: ${name} by ${message.author.tag}`,
      );
      await msg.edit(
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
      await msg.edit(
        makeErrorCard(`${Emojis.ERROR} Failed to Update Repository`, msg_),
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
      (r) => `**${r.name}** (\`${r.branch}\`)\n<${r.url}>`,
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
      const [modules, installed] = await Promise.all([
        this.downloaderService.getModulesInRepo(repoName),
        this.downloaderService.getInstalledModules(),
      ]);

      if (!modules.length) {
        await message.reply(
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
      await message.reply(makeListCard(`Modules in ${repoName}`, list));
    } catch (err: unknown) {
      await message.reply(
        makeErrorCard("Failed to Read Repository", errorFrom(err).message),
      );
    }
  }
}
