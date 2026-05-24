import type { Redis } from "ioredis";
import type { prisma } from "#database/prisma.js";
import type { ModuleStore } from "#core/module-system/ModuleStore.js";
import type { RabbitClient } from "#lib/rabbit.js";
import type { InvalidationBus } from "#database/redis.js";
import type { WorkerManager } from "#workers/WorkerManager.js";
import type { DatabaseService } from "#root/prisma/DatabaseService.js";

export type IntegerString = `${number}`;

export interface DatabaseRepositories extends DatabaseService {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target for modules to extend
export interface ModuleServiceMap {}
export type ModuleServiceStore = ModuleServiceMap & Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging target for scheduled tasks plugin
export interface EmberScheduledTasks {}

declare module "@sapphire/pieces" {
  interface Container {
    readonly prisma: typeof prisma;
    readonly redis: Redis;
    readonly invalidation: InvalidationBus;
    readonly db: DatabaseRepositories;
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
  }
}

import type { ServiceStore } from "#core/module-system/ServiceStore.js";

declare module "@sapphire/framework" {
  interface ScheduledTasks extends EmberScheduledTasks {}
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
    RABBITMQ_URL: string;
    SENTRY_ENABLED: boolean | string;
    SENTRY_DSN: string;
    WORKER_COUNT: IntegerString;
    API_ORIGIN: string;
  }
}
