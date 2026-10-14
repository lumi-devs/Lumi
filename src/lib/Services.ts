import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import type { DatabaseService } from "#src/lib/prisma/DatabaseService.js";
import type { DiscordRestPort } from "#src/lib/discord/RestPort.js";
import type { EventBus } from "#src/lib/event-bus/Types.js";
import type { ModuleStore } from "#src/lib/module-system/ModuleStore.js";
import type { TaskQueue } from "#src/lib/scheduler/Runner.js";
import type { PermitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import type { ILogger } from "#src/shared/Index.ts";
import type { Client } from "discord.js";
import { AddonModulesRoot } from "#src/lib/downloader/Resolver.js";
import { DiscordRestAdapter } from "#src/lib/discord/RestAdapter.js";
import { envParseString, getDevModulePaths } from "#src/lib/Env.js";
import { LumiLogger } from "#src/lib/logging/PinoLogger.js";
import { ModuleStore as ModuleStoreImpl } from "#src/lib/module-system/ModuleStore.js";
import { permitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import { prisma, prismaReader } from "#src/lib/prisma/Client.js";
import { DatabaseService as DatabaseServiceImpl } from "#src/lib/prisma/DatabaseService.js";
import { createEventBus } from "#src/lib/event-bus/Factory.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { invalidationBus, signalBus } from "#src/lib/cache/Signals.js";
import { pathToFileURL } from "node:url";

export type ConfigChangeHook = (guildId: string, key: string) => Promise<void>;
export type ConfigValueValidator = (
  value: unknown,
  guildId: string,
) => Promise<string | null> | string | null;

export interface Container {
  client: Client;
  logger: ILogger;
  prisma: DatabaseClient;
  cache: typeof cacheStore;
  invalidation: typeof invalidationBus;
  signals: typeof signalBus;
  db: DatabaseService;
  discordRest: DiscordRestPort;
  eventBus: EventBus;
  moduleStore: ModuleStore;
  tasks: TaskQueue;
  permitResolver: PermitResolver;
  stats: {
    messages: number;
    identifies: number;
    resumes: number;
    lastIdentify: Date | null;
    lastResume: Date | null;
  };
  configChangeHooks: Map<string, ConfigChangeHook>;
  configValueValidators: Map<string, ConfigValueValidator>;
}

export const container = {} as Container;

export function useServices(services: Container): void {
  Object.assign(container, services);
}

export function attachClient(client: Client, services: Container): void {
  services.client = client;
  client.on("messageCreate", (m) => {
    if (!m.author.bot) services.stats.messages++;
  });
}

export function createServices(
  client: Client,
  service = envParseString("SERVICE_NAME", "lumi"),
): Container {
  const logger = new LumiLogger(service);
  const eventBus = createEventBus();

  const services: Container = {
    client,
    logger,
    prisma,
    cache: cacheStore,
    invalidation: invalidationBus,
    signals: signalBus,
    db: new DatabaseServiceImpl(prisma, logger, prismaReader),
    discordRest: new DiscordRestAdapter(),
    eventBus: eventBus.bus,
    moduleStore: undefined as unknown as ModuleStore,
    permitResolver,
    tasks: undefined as unknown as TaskQueue,
    configChangeHooks: new Map(),
    configValueValidators: new Map(),
    stats: {
      messages: 0,
      identifies: 0,
      resumes: 0,
      lastIdentify: null,
      lastResume: null,
    },
  };

  services.moduleStore = new ModuleStoreImpl(services);
  services.moduleStore.addRoot(new URL("../modules/", import.meta.url));
  services.moduleStore.addRoot(pathToFileURL(`${AddonModulesRoot}/`));
  for (const devPath of getDevModulePaths()) {
    services.moduleStore.addRoot(pathToFileURL(`${devPath}/`));
  }

  useServices(services);
  return services;
}
