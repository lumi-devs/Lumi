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
  reloadModule,
  setModuleEnabled,
  uninstallModule,
  updateAllModules,
  updateModule,
} from "#modules/core/lib/module-command/operations.js";
import { getModulePiecesInfo } from "#modules/core/lib/module-command/pieces.js";
import { registerModuleCommand } from "#modules/core/lib/module-command/registry.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";

@ApplyOptions<BaseSubcommand.Options>({
  name: "module",
  description: "Manage system and third-party modules",
  preconditions: ["GuildOnly"],
  requiredPermit: "owner.*",
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
    { name: "help", run: "help", default: true },
  ],
})
export class ModuleCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registerModuleCommand(registry, this.name, this.description);
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
    await ctx.reply(
      record
        ? moduleInfoCard(record, getModulePiecesInfo(this.container, name))
        : moduleNotFoundCard(name),
    );
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

  public async help(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    await ctx.reply(moduleHelpCard());
  }
}
