import type { Logger } from "@lumi/foundation";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { DistributedScheduler } from "@lumi/scheduler";
import type { Client, Guild } from "discord.js";
import { isGuildBlacklisted, isUserBlacklisted } from "./blacklist.js";
import type { CommandSync } from "./commandSync.js";
import type { BotServices } from "./contracts.js";
import {
  type BotInteraction,
  handleInteraction,
  type PermitPanelLike,
} from "./dispatch.js";
import type { ErrorStore } from "./errorStore.js";
import type { GuildSync } from "./guildSync.js";
import type { CommandRegistry } from "./modules.js";
import { isBotOwner } from "@lumi/permits";
import { handlePrefixMessage } from "./prefix.js";

export interface ClientEventsOptions {
  readonly client: Client;
  readonly registry: CommandRegistry;
  readonly moduleLoader: ModuleLoader;
  readonly services: BotServices;
  readonly logger: Logger;
  readonly errorStore: ErrorStore;
  readonly commandSync: CommandSync;
  readonly guildSync: GuildSync;
  readonly scheduler: DistributedScheduler;
  readonly createPermitPanel: (
    guildId: string,
    interaction: BotInteraction,
  ) => PermitPanelLike;
  readonly handleComponentInteraction?: (
    interaction: BotInteraction,
    services: BotServices,
  ) => Promise<boolean>;
}

export function registerClientEvents(options: ClientEventsOptions): void {
  const {
    client,
    registry,
    moduleLoader,
    services,
    logger,
    errorStore,
    commandSync,
    guildSync,
    scheduler,
    createPermitPanel,
    handleComponentInteraction,
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
      handleComponentInteraction,
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
    if (
      await isGuildBlacklisted(
        services.prisma,
        services.helpers.cache,
        guild.id,
      )
    ) {
      await guild.leave().catch(() => undefined);
      return;
    }
    await guildSync.syncRecord(guild);
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
