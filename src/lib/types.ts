import type { Redis } from 'ioredis';
import type { prisma } from '#lib/db.js';
import type { ModuleManager } from '#lib/module-system.js';
import type { RabbitClient } from '#lib/rabbit.js';
import type { InvalidationBus } from '#lib/redis.js';
import type { db } from '#lib/database/module-data.js';
import type { WorkerManager } from '#lib/workers/WorkerManager.js';

export type IntegerString = `${number}`;

/**
 * Module → service-instance map.
 *
 * Empty by default. Each module's `index.ts` augments this with its own entry
 * via declaration merging, e.g.:
 *
 *   declare module '#lib/types.js' {
 *     interface ModuleServiceMap { afk: AfkModule }
 *   }
 *
 * Doing it that way keeps the framework (loader / container / Augments) free
 * of any knowledge of specific modules — drop a module dir in `modules/` and
 * its types attach themselves. Pure plugin pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModuleServiceMap {}

/** Runtime accessor type — declared services are typed, unknown ones are `unknown`. */
export type ModuleServiceStore = ModuleServiceMap & Record<string, unknown>;

/**
 * Scheduled-task payload map. Modules augment via declaration merging too,
 * e.g.:
 *
 *   declare module '#lib/types.js' {
 *     interface EmberScheduledTasks { 'raids:unlock': { guildId: string } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EmberScheduledTasks {}

declare module '@sapphire/pieces' {
	interface Container {
		readonly prisma: typeof prisma;
		readonly redis: Redis;
		readonly invalidation: InvalidationBus;
		readonly moduleManager: ModuleManager;
		readonly db: typeof db;
		readonly workers: WorkerManager;

		/** Global bot stats (identifies, resumes, message count). */
		stats: {
			messages: number;
			identifies: number;
			resumes: number;
			lastIdentify: Date | null;
			lastResume: Date | null;
		};

		/** Plugin-discovered module services. Module names are arbitrary strings. */
		readonly modules: ModuleServiceStore;

		/** RabbitMQ is optional — every consumer must null-check before use. */
		rabbit?: RabbitClient;
	}
}

declare module '@sapphire/framework' {
	interface ScheduledTasks extends EmberScheduledTasks {}
}

declare module '#lib/env.js' {
	interface Env {
		BOT_TOKEN: string;
		CLIENT_ID: string;
		OWNER_IDS: string;

		DEFAULT_PREFIX: string;
		NODE_ENV: 'development' | 'production' | 'test';
		LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

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
	}
}
