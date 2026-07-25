import type { Redis } from "ioredis";
import type { DatabaseClient } from "#lib/prisma/client.js";
import type { ModuleStore } from "#lib/module-system/ModuleStore.js";
import type { RabbitClient } from "#lib/rabbitmq/index.js";
import type { InvalidationBus } from "#lib/database/redis.js";
import type { EventBus, TransportKind } from "@lumi/event-bus";
import type { DatabaseService } from "#lib/prisma/DatabaseService.js";
import type { Message } from "discord.js";
import "@sapphire/pieces";

export type IntegerString = `${number}`;

/** A Discord message that is guaranteed to be from a guild and from a non-bot user. */
export type GuildMessage = Message<true>;

/** Custom events emitted by the Lumi client, separate from discord.js built-ins. */
export const LumiEvents = {
  /** Fired for every guild message from a non-bot, non-webhook user. */
  GuildUserMessage: "lumiGuildUserMessage",
} as const;

declare module "discord.js" {
  interface ClientEvents {
    lumiGuildUserMessage: [message: Message<true>];
  }
}

export type DatabaseRepositories = DatabaseService;

export type { ScheduledTasks } from "@sapphire/plugin-scheduled-tasks";

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
    readonly entityCache: import("#lib/entity-cache/RedisEntityCache.js").RedisEntityCache;
    readonly moduleStore: ModuleStore;

    stats: {
      messages: number;
      identifies: number;
      resumes: number;
      lastIdentify: Date | null;
      lastResume: Date | null;
    };

    rabbit?: RabbitClient;

    /** Key format: `"<moduleName>:<configKey>"` */
    readonly configChangeHooks: Map<string, ConfigChangeHook>;
  }
}

import type { ServiceStore } from "#lib/module-system/ServiceStore.js";

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
