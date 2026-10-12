import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import type { ValkeyClient } from "#src/lib/valkey/Cluster.js";
import type { InvalidationBus, SignalBus } from "#src/lib/valkey/Buses.js";
import type { DatabaseService } from "#src/lib/prisma/DatabaseService.js";
import type { DiscordRestPort } from "#src/lib/discord/RestPort.js";
import type { EventBus } from "#src/lib/event-bus/Types.js";
import type { ModuleStore } from "#src/lib/module-system/ModuleStore.js";
import type { TaskQueue } from "#src/lib/scheduler/Runner.js";
import type { PermitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import type { ILogger } from "#src/shared/Index.ts";
import type { Client } from "discord.js";
import {
  createValkeyClient,
  valkeyConnectionOptions,
} from "#src/lib/valkey/Client.js";
import {
  InvalidationBus as InvalidationBusImpl,
  SignalBus as SignalBusImpl,
} from "#src/lib/valkey/Buses.js";
import { AddonModulesRoot } from "#src/lib/downloader/Resolver.js";
import { DiscordRestAdapter } from "#src/lib/discord/RestAdapter.js";
import {
  envParseInteger,
  envParseString,
  getDevModulePaths,
} from "#src/lib/Env.js";
import { LumiPinoLogger } from "#src/lib/logging/PinoLogger.js";
import { ModuleStore as ModuleStoreImpl } from "#src/lib/module-system/ModuleStore.js";
import { permitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import { prisma, prismaReader } from "#src/lib/prisma/Client.js";
import { DatabaseService as DatabaseServiceImpl } from "#src/lib/prisma/DatabaseService.js";
import { createEventBus, type OwnedEventBus } from "#src/lib/event-bus/Factory.js";
import {
  streamConsumerLag,
  streamDlqLength,
  streamLength,
} from "#src/observability/Index.ts";
import { Time } from "#src/shared/Index.ts";
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
  valkey: ValkeyClient;
  invalidation: InvalidationBus;
  signals: SignalBus;
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

const ownedBuses = new WeakMap<Container, OwnedEventBus>();

export function ownedEventBusOf(services: Container): OwnedEventBus | undefined {
  return ownedBuses.get(services);
}

export function createServices(
  client: Client,
  service = envParseString("SERVICE_NAME", "lumi"),
): Container {
  const logger = new LumiPinoLogger(service);

  const valkey = createValkeyClient();
  const ownedEventBus = createEventBus({
    valkey: {
      ...valkeyConnectionOptions(),
      db: envParseInteger("VALKEY_CACHE_DB", 0),
    },
    defaultMaxLen: envParseInteger("EVENT_STREAM_MAXLEN", 100_000),
    maxDeliveries: envParseInteger("EVENT_STREAM_MAX_DELIVERIES", 5),
    claimMinIdleMs: envParseInteger("EVENT_STREAM_CLAIM_MIN_IDLE_MS", Time.Minute),
    claimIntervalMs: envParseInteger("EVENT_STREAM_CLAIM_INTERVAL_MS", 30_000),
    statsIntervalMs: envParseInteger("EVENT_STREAM_STATS_INTERVAL_MS", 10_000),
    onStats: (s) => {
      streamLength.set({ stream: s.stream }, s.length);
      streamConsumerLag.set({ stream: s.stream, group: s.group }, s.pending);
      streamDlqLength.set({ stream: s.stream }, s.dlqLength);
    },
    log: (level, msg, meta) => logger[level](`[EventBus] ${msg}`, meta),
  });

  const services: Container = {
    client,
    logger,
    prisma,
    valkey,
    invalidation: new InvalidationBusImpl(createValkeyClient(), valkey, logger),
    signals: new SignalBusImpl(createValkeyClient(), valkey, logger),
    db: new DatabaseServiceImpl(prisma, valkey, logger, prismaReader),
    discordRest: new DiscordRestAdapter(),
    eventBus: ownedEventBus.bus,
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
  ownedBuses.set(services, ownedEventBus);
  useServices(services);
  return services;
}
