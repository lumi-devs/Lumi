import {
  createRedisClient,
  redisConnectionOptions,
  InvalidationBus,
} from "#lib/database/redis.js";
import { ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";
import { envParseInteger, getDevModulePaths } from "#lib/env.js";
import { ModuleStore } from "#lib/module-system/ModuleStore.js";
import { ServiceStore } from "#lib/module-system/ServiceStore.js";
import { permitResolver } from "#lib/permissions/PermitResolver.js";
import { prisma, prismaReader } from "#lib/prisma/client.js";
import { DatabaseService } from "#lib/prisma/DatabaseService.js";
import { createEventBus, type OwnedEventBus } from "@lumi/event-bus";
import {
  streamConsumerLag,
  streamDlqLength,
  streamLength,
} from "@lumi/observability";
import { container, Store, type SapphireClient } from "@sapphire/framework";
import { pathToFileURL } from "node:url";

/**
 * Registers Lumi's own stores on the client and installs the process-wide
 * singletons that every piece reaches through `container`.
 *
 * @remarks
 *
 * Must run inside the client constructor, after `super()` (it needs
 * `client.stores`) and before any piece is loaded, because module discovery
 * and the permission store both read from `container` at load time.
 *
 * @param client - The client whose store registry is being populated.
 * @returns The event bus this process owns and must close on shutdown.
 */
export function installContainerServices(
  client: SapphireClient,
): OwnedEventBus {
  const moduleStore = new ModuleStore();
  moduleStore.addRoot(new URL("../../modules/", import.meta.url));
  moduleStore.addRoot(pathToFileURL(`${ADDON_MODULES_ROOT}/`));
  for (const devPath of getDevModulePaths()) {
    moduleStore.addRoot(pathToFileURL(`${devPath}/`));
  }
  client.stores.register(new ServiceStore());
  client.stores.register(moduleStore);
  client.stores.registerPath(new URL("../permissions/", import.meta.url));
  (client.stores.get("services") as Store<any> | undefined)?.registerPath(
    new URL("../services/", import.meta.url),
  );


  const redis = createRedisClient();
  const ownedEventBus = createEventBus({
    redis: {
      ...redisConnectionOptions(),
      db: envParseInteger("REDIS_CACHE_DB", 0),
    },
    defaultMaxLen: envParseInteger("EVENT_STREAM_MAXLEN", 100_000),
    maxDeliveries: envParseInteger("EVENT_STREAM_MAX_DELIVERIES", 5),
    claimMinIdleMs: envParseInteger("EVENT_STREAM_CLAIM_MIN_IDLE_MS", 60_000),
    claimIntervalMs: envParseInteger("EVENT_STREAM_CLAIM_INTERVAL_MS", 30_000),
    statsIntervalMs: envParseInteger("EVENT_STREAM_STATS_INTERVAL_MS", 10_000),
    onStats: (s) => {
      streamLength.set({ stream: s.stream }, s.length);
      streamConsumerLag.set({ stream: s.stream, group: s.group }, s.pending);
      streamDlqLength.set({ stream: s.stream }, s.dlqLength);
    },
    log: (level, msg, meta) =>
      container.logger[level](`[EventBus] ${msg}`, meta),
  });

  Object.assign(container, {
    prisma,
    redis,
    invalidation: new InvalidationBus(createRedisClient()),
    db: new DatabaseService(prisma, redis, container.logger, prismaReader),
    eventBus: ownedEventBus.bus,
    moduleStore,
    permitResolver,
    configChangeHooks: new Map(),
    configValueValidators: new Map(),
    stats: {
      messages: 0,
      identifies: 0,
      resumes: 0,
      lastIdentify: null,
      lastResume: null,
    },
  });

  return ownedEventBus;
}
