import type { Redis } from "ioredis";
import type { EmberPrismaClient } from "#database/client.js";
import type { ModuleStore } from "#core/module-system/ModuleStore.js";
import type { RabbitClient } from "#lib/rabbit.js";
import type { InvalidationBus } from "#database/redis.js";
import type { EventBus, TransportKind } from "@ember/event-bus";
import type { WorkerManager } from "#workers/WorkerManager.js";
import type { DatabaseService } from "#root/prisma/DatabaseService.js";

export type IntegerString = `${number}`;

export type DatabaseRepositories = DatabaseService;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target for modules to extend
export interface ModuleServiceMap {}
export type ModuleServiceStore = ModuleServiceMap & Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target for scheduled tasks plugin
export interface EmberScheduledTasks {
  "afk-delete-message": import("#modules/afk/scheduled-tasks/AfkDeleteMessageTask.js").AfkDeleteMessagePayload;
  "mod-lift": import("#modules/mod/scheduled-tasks/ModLiftTask.js").ModLiftPayload;
  "tempvc-cleanup": import("#modules/utility/tempvc/scheduled-tasks/CleanupTask.js").TempVcCleanupPayload;
  // Periodic sweepers — no payload, registered here so they can be relayed
  // through the scheduler bus (S5) without weakening the type registry.
  "captcha-expiry": Record<string, never>;
  "thread-cleaner-task": Record<string, never>;
  "flush-logs": Record<string, never>;
}

/** Modules register per-key invalidation callbacks here instead of patching ConfigService. */
export type ConfigChangeHook = (guildId: string, key: string) => Promise<void>;

declare module "@sapphire/pieces" {
  interface Container {
    readonly prisma: EmberPrismaClient;
    readonly redis: Redis;
    readonly invalidation: InvalidationBus;
    readonly db: DatabaseRepositories;
    readonly eventBus: EventBus;
    readonly eventBusTransport: TransportKind;
    /** S8 slice 3: read-through projection of guilds/channels/roles/members. */
    readonly entityCache: import("#core/entity-cache/RedisEntityCache.js").RedisEntityCache;
    readonly workers: WorkerManager;
    readonly moduleStore: ModuleStore;

    stats: {
      messages: number;
      identifies: number;
      resumes: number;
      lastIdentify: Date | null;
      lastResume: Date | null;
    };

    readonly modules: ModuleServiceStore;
    rabbit?: RabbitClient;

    /** Key format: `"<moduleName>:<configKey>"` */
    readonly configChangeHooks: Map<string, ConfigChangeHook>;
  }
}

import type { ServiceStore } from "#core/module-system/ServiceStore.js";

declare module "@sapphire/framework" {
  interface ScheduledTasks extends EmberScheduledTasks {}
  interface StoreRegistryEntries {
    services: ServiceStore;
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks extends EmberScheduledTasks {}
}

declare module "#lib/env.js" {
  interface Env {
    BOT_TOKEN: string;
    CLIENT_ID: string;
    OWNER_IDS: string;
    DEFAULT_PREFIX: string;
    NODE_ENV: "development" | "production" | "test";
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
    POSTGRES_URL: string;
    REDIS_HOST: string;
    REDIS_PORT: IntegerString;
    REDIS_PASSWORD: string;
    REDIS_CACHE_DB: IntegerString;
    REDIS_TASK_DB: IntegerString;
    /** S5 HA: comma-separated `host:port` Sentinel list. When set, all
     * Redis clients (cache, BullMQ, streams, leader-lock) talk to Sentinels
     * for master discovery + failover. Unset → direct REDIS_HOST/PORT. */
    REDIS_SENTINELS: string;
    /** Sentinel master name. Default "mymaster". */
    REDIS_SENTINEL_NAME: string;
    /** Password for Sentinel processes themselves (distinct from REDIS_PASSWORD for the master). */
    REDIS_SENTINEL_PASSWORD: string;
    /** S5 HA: when "true" on a `scheduler` replica, acquire a Redis-backed
     * leader lock before login(); followers block until it lapses. Default
     * "false" — rely on BullMQ's per-job locks for safety, accept the
     * coordination overhead of multiple active schedulers. */
    SCHEDULER_LEADER_LOCK: "true" | "false";
    SCHEDULER_LEADER_LOCK_TTL_MS: IntegerString;
    SCHEDULER_LEADER_LOCK_RENEW_MS: IntegerString;
    SCHEDULER_LEADER_LOCK_POLL_MS: IntegerString;
    RABBITMQ_URL: string;
    SENTRY_ENABLED: boolean | string;
    SENTRY_DSN: string;
    WORKER_COUNT: IntegerString;
    /** "inproc" (default) | "streams" | "nats" — selects @ember/event-bus transport. */
    TRANSPORT: "inproc" | "streams" | "nats";
    /** NATS server URL(s), comma-separated. Required when TRANSPORT=nats. */
    NATS_URL: string;
    NATS_SERVERS: string;
    NATS_USER: string;
    NATS_PASSWORD: string;
    /** Approximate per-stream cap for raw gateway events. Default 100000. */
    EVENT_STREAM_MAXLEN: IntegerString;
    /** Which service this process plays in the split topology. Default "monolith". */
    EMBER_ROLE: "monolith" | "gateway" | "worker" | "scheduler";
    /** Stable per-replica consumer id for the worker pool. Falls back to $HOSTNAME, then pid. */
    EMBER_CONSUMER_ID: string;
    /** When "true", the gateway pre-acks INTERACTION_CREATE via REST before publishing. */
    INTERACTION_DEFER_AT_GATEWAY: "true" | "false";
  }
}
