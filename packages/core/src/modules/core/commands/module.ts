import type { Container } from "#lib/services.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
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
} from "../ui/module-command-cards.js";
import {
  installModule,
  pinModule,
  reloadModule,
  setModuleEnabled,
  uninstallModule,
  unpinModule,
  updateAllModules,
  updateModule,
} from "@lumi/application/services/core/module-command/operations.js";
import { getModulePiecesInfo } from "@lumi/application/services/core/module-command/pieces.js";
import { buildModuleCommand } from "@lumi/application/services/core/module-command/registry.js";
import type { AutocompleteInteraction } from "discord.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { DownloaderUtility } from "../utilities/DownloaderUtility.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";
import {
  installedModuleChoices,
  repoModuleChoices,
  repoNameChoices,
} from "../services/downloader-autocomplete.js";

function downloaderService(): DownloaderUtility {
  return getUtility("downloader");
}

async function list(ctx: CommandContext): Promise<void> {
  const records = ctx.services.moduleStore.all();
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

async function info(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const name = (await ctx.getString("module", { required: true }))!;
  const record = ctx.services.moduleStore.getRecord(name);
  if (!record) {
    await ctx.reply(moduleNotFoundCard(name));
    return;
  }
  const installed = await downloaderService()
    .getInstalledModules(ctx.services)
    .catch(() => []);
  const pinned =
    installed.find((m) => m.moduleName === name)?.pinned ?? false;
  await ctx.reply(
    moduleInfoCard(record, await getModulePiecesInfo(record.dir), pinned),
  );
}

async function enable(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const name = (await ctx.getString("module", { required: true }))!;
  await ctx.reply(await setModuleEnabled(name, true));
}

async function disable(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const name = (await ctx.getString("module", { required: true }))!;
  await ctx.reply(await setModuleEnabled(name, false));
}

async function install(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const repoName = (await ctx.getString("repo", { required: true }))!;
  const moduleName = (await ctx.getString("module", { required: true }))!;

  if (!ctx.isSlash) {
    await ctx.reply(installProgressCard(repoName, moduleName));
  }

  await ctx.reply(await installModule(repoName, moduleName, ctx.user));
}

async function uninstall(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;

  if (!ctx.isSlash) {
    await ctx.reply(uninstallProgressCard(moduleName));
  }

  await ctx.reply(await uninstallModule(moduleName, ctx.user));
}

async function reloadModuleCmd(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;

  if (!ctx.isSlash) {
    await ctx.reply(reloadProgressCard(moduleName));
  }

  await ctx.reply(await reloadModule(moduleName, ctx.user.tag));
}

async function update(ctx: CommandContext): Promise<void> {
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

async function pin(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;
  await ctx.reply(await pinModule(moduleName));
}

async function unpin(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;
  await ctx.reply(await unpinModule(moduleName));
}

async function help(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  await ctx.reply(moduleHelpCard());
}

export const moduleDef: CommandDef = {
  name: "module",
  description: "Manage system and third-party modules",
  guildOnly: true,
  botOwner: true,
  prefixEnabled: true,
  build: () => {
    return buildModuleCommand("module", "Manage system and third-party modules");
  },
  handlers: {
    list: (ctx: CommandContext) => list(ctx),
    info: (ctx: CommandContext) => info(ctx),
    enable: (ctx: CommandContext) => enable(ctx),
    disable: (ctx: CommandContext) => disable(ctx),
    install: (ctx: CommandContext) => install(ctx),
    uninstall: (ctx: CommandContext) => uninstall(ctx),
    reload: (ctx: CommandContext) => reloadModuleCmd(ctx),
    update: (ctx: CommandContext) => update(ctx),
    pin: (ctx: CommandContext) => pin(ctx),
    unpin: (ctx: CommandContext) => unpin(ctx),
    help: (ctx: CommandContext) => help(ctx),
  },
  defaultSub: "help",
  autocomplete: async (
    services: Container,
    interaction: AutocompleteInteraction,
  ): Promise<void> => {
    const focused = interaction.options.getFocused(true);
    const subcommand = interaction.options.getSubcommand(false);

    if (focused.name === "repo") {
      return respondWithChoices(
        interaction,
        await repoNameChoices(services, downloaderService(), focused.value),
      );
    }

    if (focused.name !== "module") return respondWithChoices(interaction, []);

    if (subcommand === "install") {
      return respondWithChoices(
        interaction,
        await repoModuleChoices(
          services,
          downloaderService(),
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
        await installedModuleChoices(services, downloaderService(), focused.value, {
          pinned,
        }),
      );
    }

    if (subcommand === "enable" || subcommand === "disable") {
      const names = services.moduleStore
        .all()
        .filter((r) => (subcommand === "enable" ? !r.enabled : r.enabled))
        .map((r) => r.name);
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(names, focused.value),
      );
    }

    const names = services.moduleStore.all().map((r) => r.name);
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(names, focused.value),
    );
  },
};
