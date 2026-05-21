import {
	SapphireClient,
	LogLevel,
	container,
	ApplicationCommandRegistries,
	RegisterBehavior
} from '@sapphire/framework';
import { GatewayIntentBits, Partials, ActivityType, type Message } from 'discord.js';
import { envParseString, envParseInteger } from '@skyra/env-utilities';
import { prisma } from '#lib/db.js';

import { createRedisClient, parseRedisConnectionOption } from '#lib/redis.js';
import { ModuleManager } from '#lib/module-system.js';
import { RabbitClient } from '#lib/rabbit.js';
import { InvalidationBus } from '#lib/redis.js';
import { RedisKeys, RedisTTL } from '#lib/redis.js';
import { readSettings } from '#lib/database/settings.js';
import { WorkerManager } from '#lib/workers/WorkerManager.js';
import { PrometheusManager } from '#lib/metrics/Prometheus.js';

/**
 * The Ember Discord client.
 *
 * Owns the entire lifecycle:
 *   constructor → wire container services (sync)
 *   login()     → connect Postgres / Redis / RabbitMQ, load modules, log in
 *   destroy()   → flush modules, close transports, disconnect
 *
 * `main.ts` is a 12-line entrypoint. All orchestration lives here.
 */
export class EmberClient extends SapphireClient {
	public constructor() {
		super({
			shards: 'auto',
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.MessageContent
			],
			partials: [Partials.Channel, Partials.GuildMember],
			allowedMentions: { parse: ['users'], repliedUser: true },
			presence: { activities: [{ name: 'the server', type: ActivityType.Watching }] },
			loadMessageCommandListeners: true,
			loadDefaultErrorListeners: false,
			loadScheduledTaskErrorListeners: false,
			baseUserDirectory: new URL('.', import.meta.url),
			defaultPrefix: envParseString('DEFAULT_PREFIX', ','),
			fetchPrefix: (message) => this._fetchPrefix(message),
			logger: {
				level: envParseString('NODE_ENV', 'development') === 'production' ? LogLevel.Info : LogLevel.Debug
			},
			i18n: {
				fetchLanguage: async (context) => {
					if (!context.guild) return 'en-US';
					const settings = await readSettings(context.guild.id);
					return settings.locale;
				}
			},
			tasks: {
				bull: {
					connection: {
						...parseRedisConnectionOption(),
						db: envParseInteger('REDIS_TASK_DB', 1)
					}
				}
			}
		});

		// ── Synchronous DI wiring ────────────────────────────────────────────
		// Anything async (connect / handshake) happens in login(), not here.
		// Prisma 7: connection URL is no longer in schema.prisma — it goes through
		// a driver adapter on the client. `prisma.config.ts` provides the URL to
		// the Prisma CLI; the runtime client needs its own adapter instance.
		Reflect.set(container, 'prisma', prisma);
		Reflect.set(container, 'redis', createRedisClient());
		Reflect.set(container, 'invalidation', new InvalidationBus(createRedisClient()));
		Reflect.set(container, 'modules', Object.create(null));
		Reflect.set(
			container,
			'moduleManager',
			new ModuleManager(new URL('modules/', import.meta.url))
		);
		Reflect.set(container, 'workers', new WorkerManager());
		Reflect.set(container, 'prometheus', new PrometheusManager());

		ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

		// ── Global Stats Tracking ───────────────────────────────────────────
		container.stats = {
			messages: 0,
			identifies: 0,
			resumes: 0,
			lastIdentify: null as Date | null,
			lastResume: null as Date | null
		};

		this.on('messageCreate', () => container.stats.messages++);
		this.on('shardReady', () => {
			container.stats.identifies++;
			container.stats.lastIdentify = new Date();
		});
		this.on('shardResume', () => {
			container.stats.resumes++;
			container.stats.lastResume = new Date();
		});
	}

	public override async login(token?: string): Promise<string> {
		// 1. Postgres
		await container.prisma.$connect();
		container.logger.info('[Startup] ✓ Prisma connected');

		// 2. Redis cache + invalidation pub/sub
		await container.invalidation.start();
		container.logger.info('[Startup] ✓ Redis invalidation bus listening');

		// 3. RabbitMQ (optional)
		const rabbitUrl = envParseString('RABBITMQ_URL', '');
		if (rabbitUrl) {
			container.rabbit = new RabbitClient(rabbitUrl);
			await container.rabbit.waitForConnect();
			container.logger.info('[Startup] ✓ RabbitMQ connected (RPC + job queue)');
		} else {
			container.logger.info('[Startup] · RabbitMQ skipped (no RABBITMQ_URL)');
		}

		// 4. Modules — discover, register pieces with Sapphire stores, then run
		//    each module's onLoad hook. Must happen BEFORE super.login() so the
		//    stores see the piece dirs when they boot.
		await container.moduleManager.discover();
		container.moduleManager.registerPieces();
		await container.moduleManager.loadAll();
		container.logger.info('[Startup] ✓ Modules loaded');

		// 5. Prometheus
		container.prometheus.start();

		// 6. Connect to Discord
		return super.login(token);
	}

	public override async destroy(): Promise<void> {
		container.logger.info('[Shutdown] Tearing down…');
		await container.moduleManager.unloadAll();
		await super.destroy();
		await container.workers.destroy();
		container.prometheus.stop();
		await container.rabbit?.close();
		await container.invalidation.stop();
		await container.redis.quit().catch(() => undefined);
		await container.prisma.$disconnect().catch(() => undefined);
		container.logger.info('[Shutdown] ✓ Clean exit');
	}

	private async _fetchPrefix(message: Message): Promise<string | string[] | null> {
		const guildId = message.guild?.id;
		const fallback = envParseString('DEFAULT_PREFIX', ',');
		if (!guildId) return fallback;

		const cacheKey = RedisKeys.guildPrefixes(guildId);
		const cached = await container.redis.get(cacheKey);
		if (cached) return JSON.parse(cached) as string[];

		const settings = await readSettings(guildId);
		const prefixes = settings.prefix ? [settings.prefix, fallback] : [fallback];
		await container.redis.setex(cacheKey, RedisTTL.guildPrefix, JSON.stringify(prefixes));
		return prefixes;
	}
}
