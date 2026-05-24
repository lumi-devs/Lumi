import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { MessageFlags, ApplicationIntegrationType } from "discord.js";
import {
  ephemeralCard,
  makeSuccessCard,
  makeErrorCard,
  makeListCard,
} from "#utilities/cards.js";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { fetchT } from "@sapphire/plugin-i18next";
import { EmberEmojis } from "#utilities/assets.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "repo",
  description: "Manage third-party module repositories",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "add", chatInputRun: "chatInputAdd" },
    { name: "list", chatInputRun: "chatInputList" },
    { name: "modules", chatInputRun: "chatInputModules" },
  ],
})
export class RepoCommand extends EmberSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ): void {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("repo")
        .setDescription(
          "Manage third-party module repositories (Bot Owner Only)",
        )
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add a new module repository")
            .addStringOption((opt) =>
              opt
                .setName("name")
                .setDescription("A unique name for this repo")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("url")
                .setDescription("The Git URL of the repository")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("branch")
                .setDescription("Branch to track (default: master)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("List all added repositories"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("modules")
            .setDescription("List all discoverable modules within a repository")
            .addStringOption((opt) =>
              opt
                .setName("repo")
                .setDescription("The repository name")
                .setRequired(true),
            ),
        ),
    );
  }

  private get downloaderService(): import("#core/services/DownloaderService.js").DownloaderService {
    return this.container.stores
      .get("services")
      .get(
        "downloader",
      ) as import("#core/services/DownloaderService.js").DownloaderService;
  }

  public async chatInputAdd(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name = interaction.options.getString("name", true);
    const url = interaction.options.getString("url", true);
    const branch = interaction.options.getString("branch") ?? "master";

    try {
      await this.downloaderService.addRepo(name, url, branch);
      this.container.logger.info(
        `[Repo] ${EmberEmojis.REPO} Added repository: ${name} (${url}@${branch}) by ${interaction.user.tag}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeSuccessCard(
            `${EmberEmojis.REPO} Repository Added`,
            `Successfully cloned/updated repository **${name}**.\nYou can now use \`/repo modules repo:${name}\` to view available modules.`,
          ),
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.container.logger.warn(
        `[Repo] ${EmberEmojis.ERROR} Failed to add repo: ${name} — ${error.message}`,
      );
      await this.reply(
        interaction,
        ephemeralCard(
          makeErrorCard(
            `${EmberEmojis.ERROR} Failed to Add Repository`,
            error.message,
          ),
        ),
      );
    }
  }

  public async chatInputList(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const repos = await this.downloaderService.listRepos();
    if (!repos.length) {
      await this.reply(
        interaction,
        ephemeralCard(
          makeErrorCard(
            "No Repositories",
            "No third-party repositories have been added yet.",
          ),
        ),
      );
      return;
    }

    const list = repos.map(
      (r: import("@prisma/client").DownloaderRepo) =>
        `**${r.name}** (\`${r.branch}\`)\n<${r.url}>`,
    );
    const t = await fetchT(interaction);
    await this.reply(
      interaction,
      ephemeralCard(makeListCard(t, "Added Repositories", list)),
    );
  }

  public async chatInputModules(
    interaction: Subcommand.ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const repoName = interaction.options.getString("repo", true);

    try {
      const modules = await this.downloaderService.getModulesInRepo(repoName);

      if (!modules.length) {
        await this.reply(
          interaction,
          ephemeralCard(
            makeErrorCard(
              "No Modules Found",
              `Repository **${repoName}** contains no discoverable modules with an \`info.json\` file.`,
            ),
          ),
        );
        return;
      }

      const list = modules.map(
        (m) => `**${m.name}** (v${m.version})\n*${m.short}*`,
      );
      const t = await fetchT(interaction);
      await this.reply(
        interaction,
        ephemeralCard(makeListCard(t, `Modules in ${repoName}`, list)),
      );
    } catch (err: unknown) {
      const error = err as Error;
      await this.reply(
        interaction,
        ephemeralCard(
          makeErrorCard("Failed to Read Repository", error.message),
        ),
      );
    }
  }
}
