import { logger } from "@lumi/foundation";
import Redis from "ioredis";
import { serverConfig } from "./env";

const globalForRedis = globalThis as typeof globalThis & {
  __lumiDashboardRedis?: Redis;
};

const globalForInvalidation = globalThis as typeof globalThis & {
  __lumiDashboardInvalidation?: InvalidationBus;
};

const INVALIDATION_CHANNEL = "lumi:invalidation";

export function getRedis(): Redis {
  if (globalForRedis.__lumiDashboardRedis) {
    return globalForRedis.__lumiDashboardRedis;
  }

  const config = serverConfig();
  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  } as const;

  const redis = config.redisUrl
    ? new Redis(config.redisUrl, options)
    : new Redis({
        ...options,
        host: config.redisHost,
        port: config.redisPort,
        db: config.redisDb,
        ...(config.redisPassword ? { password: config.redisPassword } : {}),
      });

  redis.on("error", (error: Error) => {
    logger.error("[dashboard] redis error", error.message);
  });

  globalForRedis.__lumiDashboardRedis = redis;
  return redis;
}

export function dashboardKey(...parts: Array<string | number>): string {
  return ["lumi", "dashboard", ...parts.map(String)].join(":");
}

interface InvalidationBus {
  subscribe(namespace: string, listener: (keys: string[]) => void): () => void;
  close(): Promise<void>;
}

function createInvalidationBus(): InvalidationBus {
  const redis = getRedis();
  const localListeners = new Map<string, Set<(keys: string[]) => void>>();
  const subscriber = redis.duplicate();

  subscriber.on("message", (_channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      if (data.namespace && Array.isArray(data.keys)) {
        const listeners = localListeners.get(data.namespace);
        if (listeners) {
          for (const listener of listeners) {
            listener(data.keys);
          }
        }
      }
    } catch {
      // Ignore invalid messages
    }
  });

  subscriber.subscribe(INVALIDATION_CHANNEL);

  return {
    subscribe(namespace: string, listener: (keys: string[]) => void) {
      if (!localListeners.has(namespace)) {
        localListeners.set(namespace, new Set());
      }
      localListeners.get(namespace)!.add(listener);
      return () => {
        localListeners.get(namespace)?.delete(listener);
      };
    },
    async close() {
      await subscriber.unsubscribe(INVALIDATION_CHANNEL);
      await subscriber.quit();
    },
  };
}

export function getInvalidationBus(): InvalidationBus {
  if (globalForInvalidation.__lumiDashboardInvalidation) {
    return globalForInvalidation.__lumiDashboardInvalidation;
  }

  const bus = createInvalidationBus();
  globalForInvalidation.__lumiDashboardInvalidation = bus;
  return bus;
}