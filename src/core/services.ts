import { createCache, type NamespacedCache } from "@lumi/cache";
import { createDbHelpers, prisma as defaultPrisma } from "@lumi/db";
import {
  createHealthMonitor,
  type HealthMonitor,
  prometheusCacheMetrics,
} from "@lumi/observability";
import { PermitRepository } from "@lumi/permits";
import { InvalidationBus } from "@lumi/redis";
import { DistributedScheduler } from "@lumi/scheduler";
import type { PrismaClient } from "@prisma/client";
import type { Client } from "discord.js";
import type { Redis } from "ioredis";
import {
  ConfigService,
  type GuildSettings,
} from "./ConfigService.js";

export interface CoreServicesOptions {
  client: Client;
  redis: Redis;
  prisma?: PrismaClient;
  cacheNamespace?: string;
}

export interface CoreServices {
  client: Client;
  redis: Redis;
  prisma: PrismaClient;
  helpers: ReturnType<typeof createDbHelpers>;
  invalidation: InvalidationBus;
  cache: NamespacedCache<GuildSettings>;
  configCache: NamespacedCache<GuildSettings>;
  permits: PermitRepository;
  configService: ConfigService;
  scheduler: DistributedScheduler;
  healthMonitor: HealthMonitor;
}

export function createCoreServices(options: CoreServicesOptions): CoreServices {
  const db = options.prisma ?? defaultPrisma;
  const invalidation = new InvalidationBus(options.redis);
  const cache = createCache<GuildSettings>({
    redis: options.redis,
    invalidation,
    metrics: prometheusCacheMetrics,
    defaultTtlMs: 60_000,
    defaultNegativeTtlMs: 15_000,
  }).namespace(options.cacheNamespace ?? process.env.CACHE_NAMESPACE ?? "lumi");
  const configCache = cache.namespace("config");
  const helpers = createDbHelpers(options.redis);

  return {
    client: options.client,
    redis: options.redis,
    prisma: db,
    helpers,
    invalidation,
    cache,
    configCache,
    permits: new PermitRepository(db, options.redis),
    configService: new ConfigService({
      prisma: db,
      cache: configCache,
    }),
    scheduler: new DistributedScheduler(options.redis),
    healthMonitor: createHealthMonitor(),
  };
}
