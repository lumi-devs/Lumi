import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { paginateList } from "#lib/utilities/pagination.js";
import {
  installProgressCard,
  moduleHelpCard,
  moduleInfoCard,
  moduleListEntries,
  moduleNotFoundCard,
  noModulesDiscoveredCard,
  reloadProgressCard,
  uninstallProgressCard,
  updateAllProgressCard,
  updateProgressCard,
} from "#modules/core/lib/module-command/cards.js";
import {
  installModule,
  pinModule,
  reloadModule,
  setModuleEnabled,
  uninstallModule,
  unpinModule,
  updateAllModules,
  updateModule,
} from "#modules/core/lib/module-command/operations.js";
import { getModulePiecesInfo } from "#modules/core/lib/module-command/pieces.js";
import { registerModuleCommand } from "#modules/core/lib/module-command/registry.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { AutocompleteInteraction } from "discord.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { DownloaderUtility } from "#utilities/pieces/DownloaderUtility.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";
import {
  installedModuleChoices,
  repoModuleChoices,
  repoNameChoices,
} from "#lib/downloader/autocomplete.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "module",
  description: "Manage system and third-party modules",
  preconditions: ["GuildOnly", "BotOwner"],
  prefixEnabled: true,
  subcommands: [
    { name: "list", run: "list" },
    { name: "info", run: "info" },
    { name: "enable", run: "enable" },
    { name: "disable", run: "disable" },
    { name: "install", run: "install" },
    { name: "uninstall", run: "uninstall" },
    { name: "reload", run: "reloadModuleCmd" },
    { name: "update", run: "update" },
    { name: "pin", run: "pin" },
    { name: "unpin", run: "unpin" },
    { name: "help", run: "help", default: true },
  ],
})
export class ModuleCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registerModuleCommand(registry, this.name, this.description);
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused(true);
    const subcommand = interaction.options.getSubcommand(false);

    if (focused.name === "repo") {
      return respondWithChoices(
        interaction,
        await repoNameChoices(this.downloaderService, focused.value),
      );
    }

    if (focused.name !== "module") return respondWithChoices(interaction, []);

    if (subcommand === "install") {
      return respondWithChoices(
        interaction,
        await repoModuleChoices(
          this.downloaderService,
          interaction,
          "repo",
          focused.value,
        ),
      );
    }

    if (["uninstall", "update", "pin", "unpin"].includes(subcommand ?? "")) {
      const pinned =
        subcommand === "pin" ? false : subcommand === "unpin" ? true : undefined;
      return respondWithChoices(
        interaction,
        await installedModuleChoices(this.downloaderService, focused.value, {
          pinned,
        }),
      );
    }

    if (subcommand === "enable" || subcommand === "disable") {
      const names = this.container.moduleStore
        .all()
        .filter((r) => (subcommand === "enable" ? !r.enabled : r.enabled))
        .map((r) => r.name);
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(names, focused.value),
      );
    }

    const names = this.container.moduleStore.all().map((r) => r.name);
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(names, focused.value),
    );
  }

  public async list(ctx: CommandContext): Promise<void> {
    const records = this.container.moduleStore.all();
    if (!records.length) {
      await ctx.reply(noModulesDiscoveredCard());
      return;
    }

    await paginateList({
      interactionOrMessage: ctx.source,
      userId: ctx.user.id,
      title: "Discovered Modules",
      items: moduleListEntries(records),
      perPage: 5,
    });
  }

  public async info(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const name = (await ctx.getString("module", { required: true }))!;
    const record = this.container.moduleStore.getRecord(name);
    if (!record) {
      await ctx.reply(moduleNotFoundCard(name));
      return;
    }
    const installed = await this.downloaderService
      .getInstalledModules()
      .catch(() => []);
    const pinned =
      installed.find((m) => m.moduleName === name)?.pinned ?? false;
    await ctx.reply(
      moduleInfoCard(record, getModulePiecesInfo(this.container, name), pinned),
    );
  }

  private get downloaderService(): DownloaderUtility {
    return getUtility("downloader");
  }

  public async enable(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const name = (await ctx.getString("module", { required: true }))!;
    await ctx.reply(await setModuleEnabled(name, true));
  }

  public async disable(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const name = (await ctx.getString("module", { required: true }))!;
    await ctx.reply(await setModuleEnabled(name, false));
  }

  public async install(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const repoName = (await ctx.getString("repo", { required: true }))!;
    const moduleName = (await ctx.getString("module", { required: true }))!;

    if (!ctx.isSlash) {
      await ctx.reply(installProgressCard(repoName, moduleName));
    }

    await ctx.reply(await installModule(repoName, moduleName, ctx.user));
  }

  public async uninstall(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = (await ctx.getString("module", { required: true }))!;

    if (!ctx.isSlash) {
      await ctx.reply(uninstallProgressCard(moduleName));
    }

    await ctx.reply(await uninstallModule(moduleName, ctx.user));
  }

  public async reloadModuleCmd(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = (await ctx.getString("module", { required: true }))!;

    if (!ctx.isSlash) {
      await ctx.reply(reloadProgressCard(moduleName));
    }

    await ctx.reply(await reloadModule(moduleName, ctx.user.tag));
  }

  public async update(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = await ctx.getString("module", { required: false });

    if (moduleName) {
      if (!ctx.isSlash) {
        await ctx.reply(updateProgressCard(moduleName));
      }

      await ctx.reply(await updateModule(moduleName, ctx.user.id));
      return;
    }

    if (!ctx.isSlash) {
      await ctx.reply(updateAllProgressCard());
    }

    await ctx.reply(await updateAllModules(ctx.user.id));
  }

  public async pin(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = (await ctx.getString("module", { required: true }))!;
    await ctx.reply(await pinModule(moduleName));
  }

  public async unpin(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const moduleName = (await ctx.getString("module", { required: true }))!;
    await ctx.reply(await unpinModule(moduleName));
  }

  public async help(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    await ctx.reply(moduleHelpCard());
  }
}
