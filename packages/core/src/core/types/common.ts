import type { Redis } from "ioredis";
import type { DatabaseClient } from "#database/client.js";
import type { ModuleStore } from "#core/module-system/ModuleStore.js";
import type { RabbitClient } from "#lib/rabbit.js";
import type { InvalidationBus } from "#database/redis.js";
import type { EventBus, TransportKind } from "@lumi-devs/event-bus";
import type { DatabaseService } from "#root/prisma/DatabaseService.js";

export type IntegerString = `${number}`;

export type DatabaseRepositories = DatabaseService;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target for modules to extend
export interface ModuleServiceMap {}
export type ModuleServiceStore = ModuleServiceMap & Record<string, unknown>;

// Scheduled-task registry. Each task registers its own name -> payload on Sapphire's
// `ScheduledTasks` interface via declaration merging, co-located in its own piece file
// (e.g. afk/scheduled-tasks/AfkDeleteMessageTask.ts) — so third-party/addon modules
// extend it the same way without touching core. Re-exported so our helpers key off it.
export type { ScheduledTasks } from "@sapphire/plugin-scheduled-tasks";

// Core task augmentations co-located here so they're visible whenever common.ts
// is imported (augmentation files are only loaded if they're in the import chain).
declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "flush-logs": Record<string, never>;
  }
}

/** Modules register per-key invalidation callbacks here instead of patching ConfigService. */
export type ConfigChangeHook = (guildId: string, key: string) => Promise<void>;

declare module "@sapphire/pieces" {
  interface Container {
    readonly prisma: DatabaseClient;
    readonly redis: Redis;
    readonly invalidation: InvalidationBus;
    readonly db: DatabaseRepositories;
    readonly eventBus: EventBus;
    readonly eventBusTransport: TransportKind;
    /** Read-through projection of guilds/channels/roles/members. */
    readonly entityCache: import("#core/entity-cache/RedisEntityCache.js").RedisEntityCache;
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
  interface StoreRegistryEntries {
    services: ServiceStore;
  }
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
    /** Comma-separated `host:port` Sentinel list. When set, all
     * Redis clients (cache, BullMQ, streams, leader-lock) talk to Sentinels
     * for master discovery + failover. Unset → direct REDIS_HOST/PORT. */
    REDIS_SENTINELS: string;
    /** Sentinel master name. Default "mymaster". */
    REDIS_SENTINEL_NAME: string;
    /** Password for Sentinel processes themselves (distinct from REDIS_PASSWORD for the master). */
    REDIS_SENTINEL_PASSWORD: string;
    /** When "true" on a `scheduler` replica, acquire a Redis-backed
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
    /** "inproc" (default) | "streams" | "nats" — selects @lumi/event-bus transport. */
    TRANSPORT: "inproc" | "streams" | "nats";
    /** NATS server URL(s), comma-separated. Required when TRANSPORT=nats. */
    NATS_URL: string;
    NATS_SERVERS: string;
    NATS_USER: string;
    NATS_PASSWORD: string;
    /** Approximate per-stream cap for raw gateway events. Default 100000. */
    EVENT_STREAM_MAXLEN: IntegerString;
    /** NATS ackWait / Redis Streams consumer idle threshold in ms. Default 60000. */
    EVENT_STREAM_ACK_WAIT_MS: IntegerString;
    /** Which service this process plays in the split topology. Default "monolith". */
    LUMI_ROLE: "monolith" | "gateway" | "worker" | "scheduler";
    /** Stable per-replica consumer id for the worker pool. Falls back to $HOSTNAME, then pid. */
    LUMI_CONSUMER_ID: string;
    /** When "true", the gateway pre-acks INTERACTION_CREATE via REST before publishing. */
    INTERACTION_DEFER_AT_GATEWAY: "true" | "false";
  }
}
