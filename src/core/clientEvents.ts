import type { Logger } from "@lumi/foundation";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { DistributedScheduler } from "@lumi/scheduler";
import type { Client, Guild } from "discord.js";
import type { PermitPanel } from "../admin/panel/PermitPanel.js";
import { isGuildBlacklisted, isUserBlacklisted } from "./blacklist.js";
import type { CommandSync } from "./commandSync.js";
import type { BotServices } from "./contracts.js";
import { type BotInteraction, handleInteraction } from "./dispatch.js";
import type { ErrorStore } from "./errorStore.js";
import type { GuildSync } from "./guildSync.js";
import type { CommandRegistry, ModuleHost } from "./modules.js";
import { isBotOwner } from "./owner.js";
import { handlePrefixMessage } from "./prefix.js";

export interface ClientEventsOptions {
  readonly client: Client;
  readonly registry: CommandRegistry;
  readonly moduleLoader: ModuleLoader;
  readonly services: BotServices;
  readonly logger: Logger;
  readonly errorStore: ErrorStore;
  readonly host: Pick<ModuleHost, "load">;
  readonly commandSync: CommandSync;
  readonly guildSync: GuildSync;
  readonly scheduler: DistributedScheduler;
  readonly createPermitPanel: (
    guildId: string,
    interaction: BotInteraction,
  ) => PermitPanel;
}

export function registerClientEvents(options: ClientEventsOptions): void {
  const {
    client,
    registry,
    moduleLoader,
    services,
    logger,
    errorStore,
    host,
    commandSync,
    guildSync,
    scheduler,
    createPermitPanel,
  } = options;

  client.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, {
      client,
      registry,
      moduleLoader,
      services,
      logger,
      errorStore,
      createPermitPanel,
    });
  });

  client.on("messageCreate", async (message) => {
    if (!message.inGuild()) return;
    if (
      !isBotOwner(message.author.id) &&
      ((await isUserBlacklisted(
        services.prisma,
        services.helpers.cache,
        message.author.id,
      )) ||
        (await isGuildBlacklisted(
          services.prisma,
          services.helpers.cache,
          message.guildId,
        )))
    ) {
      return;
    }
    await handlePrefixMessage(message, {
      client,
      registry,
      moduleLoader,
      logger,
      services,
    });
  });

  client.on("guildCreate", async (guild: Guild) => {
    if (await isGuildBlacklisted(services.prisma, services.helpers.cache, guild.id)) {
      await guild.leave().catch(() => undefined);
      return;
    }
    await guildSync.syncRecord(guild);
    await host.load(await moduleLoader.discover());
    await guildSync.syncModules(guild.id);
    await commandSync.syncGuild(guild.id);
  });

  client.on("guildDelete", async (guild: Guild) => {
    await commandSync.syncGuild(guild.id);
  });

  client.once("clientReady", async () => {
    for (const guild of client.guilds.cache.values()) {
      await guildSync.syncRecord(guild);
      await guildSync.syncModules(guild.id);
    }
    await commandSync.syncAll();
    await scheduler.start();
  });
}
