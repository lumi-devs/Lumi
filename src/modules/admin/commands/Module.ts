import type { Container } from "#src/lib/Services.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { paginateList } from "#src/lib/utilities/Pagination.js";
import {
  installProgressCard,
  loadProgressCard,
  moduleHelpCard,
  moduleInfoCard,
  moduleListEntries,
  moduleNotFoundCard,
  noModulesDiscoveredCard,
  reloadProgressCard,
  uninstallProgressCard,
  unloadProgressCard,
  updateAllProgressCard,
  updateProgressCard,
} from "#src/modules/admin/ui/ModuleCommandCards.js";
import {
  installModule,
  loadModuleOnce,
  pinModule,
  reloadModule,
  setModuleEnabled,
  uninstallModule,
  unloadModuleOnce,
  unpinModule,
  updateAllModules,
  updateModule,
} from "#src/modules/admin/services/Operations.js";
import { getModulePiecesInfo } from "#src/modules/admin/services/Pieces.js";
import { buildModuleCommand } from "#src/modules/admin/services/Registry.js";
import type { AutocompleteInteraction } from "discord.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { DownloaderUtility } from "#src/modules/admin/utilities/DownloaderUtility.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#src/lib/utilities/Autocomplete.js";
import {
  installedModuleChoices,
  repoModuleChoices,
  repoNameChoices,
} from "#src/modules/admin/services/DownloaderAutocomplete.js";

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

  await ctx.reply(installProgressCard(repoName, moduleName));

  await ctx.reply(await installModule(repoName, moduleName, ctx.user));
}

async function uninstall(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;

  await ctx.reply(uninstallProgressCard(moduleName));

  await ctx.reply(await uninstallModule(moduleName, ctx.user));
}

async function reloadModuleCmd(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;

  await ctx.reply(reloadProgressCard(moduleName));

  await ctx.reply(await reloadModule(moduleName, ctx.user.tag));
}

async function update(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = await ctx.getString("module", { required: false });

  if (moduleName) {
    await ctx.reply(updateProgressCard(moduleName));

    await ctx.reply(await updateModule(moduleName, ctx.user.id));
    return;
  }

  await ctx.reply(updateAllProgressCard());

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

async function loadModuleCmd(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;

  await ctx.reply(loadProgressCard(moduleName));

  await ctx.reply(await loadModuleOnce(moduleName, ctx.user.tag));
}

async function unloadModuleCmd(ctx: CommandContext): Promise<void> {
  await ctx.defer();
  const moduleName = (await ctx.getString("module", { required: true }))!;

  await ctx.reply(unloadProgressCard(moduleName));

  await ctx.reply(await unloadModuleOnce(moduleName, ctx.user.tag));
}

async function status(ctx: CommandContext): Promise<void> {
  const records = ctx.services.moduleStore.all();
  if (!records.length) {
    await ctx.reply(noModulesDiscoveredCard());
    return;
  }
  const loaded = new Set(ctx.services.moduleStore.loaded().map((r) => r.name));

  await paginateList({
    interactionOrMessage: ctx.source,
    userId: ctx.user.id,
    title: "Loaded vs Available Modules",
    items: moduleListEntries(records).map((entry, i) => {
      const name = records[i]!.name;
      return `${loaded.has(name) ? "🟢" : "⬜"} ${entry}`;
    }),
    perPage: 5,
  });
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
    list,
    info,
    enable,
    disable,
    install,
    uninstall,
    reload: (ctx: CommandContext) => reloadModuleCmd(ctx),
    load: (ctx: CommandContext) => loadModuleCmd(ctx),
    unload: (ctx: CommandContext) => unloadModuleCmd(ctx),
    status,
    update,
    pin,
    unpin,
    help,
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
      let pinned: boolean | undefined;
      if (subcommand === "pin") pinned = false;
      else if (subcommand === "unpin") pinned = true;
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

    if (subcommand === "load" || subcommand === "unload") {
      const loaded = new Set(services.moduleStore.loaded().map((r) => r.name));
      const names = services.moduleStore
        .all()
        .filter((r) => (subcommand === "load" ? !loaded.has(r.name) : loaded.has(r.name)))
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
