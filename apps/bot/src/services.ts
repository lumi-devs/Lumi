import { Cache } from "@lumi/cache";
import { createDatabase, DatabaseService, type DatabaseCaches } from "@lumi/db";
import { env, type Logger } from "@lumi/foundation";
import { prometheusCacheMetrics } from "@lumi/observability";
import { createKeys, createRedisClient, InvalidationBus, type RedisKeys } from "@lumi/redis";
import type { LumiServices, ModuleRegistry, RuntimeConfig } from "@lumi/bot-kit";
import type { AddonControl, ModuleControl } from "@lumi/contracts";
import type { Client } from "discord.js";

export interface CoreServices {
  readonly db: DatabaseService;
  readonly cache: Cache;
  readonly caches: DatabaseCaches;
  readonly redis: ReturnType<typeof createRedisClient>;
  readonly invalidation: InvalidationBus;
  readonly keys: RedisKeys;
  readonly runtime: RuntimeConfig;
  shutdown(): Promise<void>;
}

export async function createCoreServices(logger: Logger): Promise<CoreServices> {
  const keys = createKeys(env.cacheNamespace());
  const publisher = createRedisClient({ url: env.redisUrl(), role: "cache", logger });
  const subscriber = createRedisClient({ url: env.redisUrl(), role: "subscriber", logger });

  await publisher.connect();
  const invalidation = new InvalidationBus({ publisher, subscriber, logger });
  await invalidation.start();

  const cache = new Cache({
    redis: publisher,
    invalidation,
    metrics: prometheusCacheMetrics,
  });

  const caches: DatabaseCaches = {
    guild: cache.namespace("guild"),
    config: cache.namespace("config"),
    module: cache.namespace("module"),
    moduleData: cache.namespace("module-data"),
    afk: cache.namespace("afk"),
  };

  const handle = createDatabase({ url: env.postgresUrl(), logger });
  const db = new DatabaseService({ handle, caches, invalidation, redis: publisher, keys, logger });

  return {
    db,
    cache,
    caches,
    redis: publisher,
    invalidation,
    keys,
    runtime: { defaultPrefix: env.defaultPrefix(), ownerIds: env.ownerIds() },
    async shutdown() {
      await invalidation.close().catch(() => undefined);
      await publisher.quit().catch(() => undefined);
      await db.close().catch(() => undefined);
    },
  };
}

export function composeServices(
  core: CoreServices,
  client: Client,
  logger: Logger,
  modules: ModuleRegistry & ModuleControl,
  addons: AddonControl,
): LumiServices {
  return {
    client,
    logger,
    db: core.db,
    cache: core.cache,
    caches: core.caches,
    redis: core.redis,
    invalidation: core.invalidation,
    keys: core.keys,
    modules,
    moduleControl: modules,
    addons,
    runtime: core.runtime,
  };
}
