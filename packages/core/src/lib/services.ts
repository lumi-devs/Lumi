import type { DatabaseClient } from "@lumi/lib/prisma/client.js";
import type { ValkeyClient } from "@lumi/infrastructure/database";
import type { InvalidationBus, SignalBus } from "@lumi/lib/valkey/buses.js";
import type { DatabaseService } from "@lumi/lib/prisma/database-service.js";
import type { DiscordRestPort } from "@lumi/lib/discord/rest-port.js";
import type { EventBus } from "@lumi/lib/event-bus/types.js";
import type { ModuleStore } from "@lumi/lib/module-system/module-store.js";
import type { TaskQueue } from "@lumi/lib/scheduler/runner.js";
import type { PermitResolver } from "@lumi/lib/permissions/permit-resolver.js";
import type { ILogger } from "@lumi/shared";
import type { Client } from "discord.js";
import {
  createValkeyClient,
  valkeyConnectionOptions,
} from "@lumi/lib/valkey/client.js";
import {
  InvalidationBus as InvalidationBusImpl,
  SignalBus as SignalBusImpl,
} from "@lumi/lib/valkey/buses.js";
import { AddonModulesRoot } from "@lumi/lib/downloader/resolver.js";
import { DiscordRestAdapter } from "@lumi/lib/discord/rest-adapter.js";
import {
  envParseInteger,
  envParseString,
  getDevModulePaths,
} from "@lumi/lib/env.js";
import { LumiPinoLogger } from "@lumi/lib/logging/pino-logger.js";
import { ModuleStore as ModuleStoreImpl } from "@lumi/lib/module-system/module-store.js";
import { permitResolver } from "@lumi/lib/permissions/permit-resolver.js";
import { prisma, prismaReader } from "@lumi/lib/prisma/client.js";
import { DatabaseService as DatabaseServiceImpl } from "@lumi/lib/prisma/database-service.js";
import { createEventBus, type OwnedEventBus } from "@lumi/lib/event-bus/factory.js";
import {
  streamConsumerLag,
  streamDlqLength,
  streamLength,
} from "@lumi/observability";
import { Time } from "@lumi/shared";
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

/** Installs a built service bag as the process-default instance. */
export function useServices(services: Container): void {
  Object.assign(container, services);
}

const ownedBuses = new WeakMap<Container, OwnedEventBus>();

/** Returns the owned event bus created alongside a `createServices` bag. */
export function ownedEventBusOf(services: Container): OwnedEventBus | undefined {
  return ownedBuses.get(services);
}

/**
 * Builds the full service bag for one already-created discord.js client.
 * Pure construction into a fresh object — no global is touched; call
 * `useServices()` to install the result as the process default.
 */
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
