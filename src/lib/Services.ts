import type { DatabaseClient } from "@db/Client.js";
import type { RedisClient } from "@redis/Cluster.js";
import type { DatabaseService } from "@db/DatabaseService.js";
import type { DiscordRestPort } from "@discord/RestPort.js";
import type { EventBus } from "@event-bus/Types.js";
import type { ModuleStore } from "@module-system/ModuleStore.js";
import type { TaskQueue } from "@scheduler/Runner.js";
import type { PermitResolver } from "@api/permissions/PermitResolver.js";
import type { ILogger } from "@shared/Index.ts";
import type { Client } from "discord.js";
import {
  createRedisClient,
  redisConnectionOptions,
  InvalidationBus,
  SignalBus,
} from "@redis/Store.js";
import { AddonModulesRoot } from "@downloader/Resolver.js";
import { DiscordRestAdapter } from "@discord/RestAdapter.js";
import {
  envParseInteger,
  envParseString,
  getDevModulePaths,
} from "@lib/Env.js";
import { LumiPinoLogger } from "@lib/logging/PinoLogger.js";
import { ModuleStore as ModuleStoreImpl } from "@module-system/ModuleStore.js";
import { permitResolver } from "@api/permissions/PermitResolver.js";
import { prisma, prismaReader } from "@db/Client.js";
import { DatabaseService as DatabaseServiceImpl } from "@db/DatabaseService.js";
import { createEventBus, type OwnedEventBus } from "@event-bus/Factory.js";
import {
  streamConsumerLag,
  streamDlqLength,
  streamLength,
} from "@observability/Index.ts";
import { Time } from "@shared/Index.ts";
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
  redis: RedisClient;
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

  const redis = createRedisClient();
  const ownedEventBus = createEventBus({
    redis: {
      ...redisConnectionOptions(),
      db: envParseInteger("REDIS_CACHE_DB", 0),
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
    redis,
    invalidation: new InvalidationBus(createRedisClient(), redis, logger),
    signals: new SignalBus(createRedisClient(), redis, logger),
    db: new DatabaseServiceImpl(prisma, redis, logger, prismaReader),
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
