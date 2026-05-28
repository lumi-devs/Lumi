import {
  SapphireClient,
  container,
  ApplicationCommandRegistries,
  RegisterBehavior,
} from "@sapphire/framework";
import {
  GatewayIntentBits,
  Partials,
  type Message,
  Options,
  Sweepers,
  type PresenceStatusData,
} from "discord.js";
import {
  envParseString,
  envParseInteger,
  getEmberRole,
  getConsumerId,
  getClusterName,
  isInteractionDeferAtGateway,
  roleOwnsScheduler,
  roleExecutesTaskEffects,
  type EmberRole,
} from "#lib/env.js";
import { SchedulerRequestConsumer } from "#core/lib/scheduler-request-consumer.js";
import { TaskFireConsumer } from "#core/lib/task-fire-registry.js";
import { registerCoreFireHandlers } from "#core/lib/core-fire-handlers.js";
import { prisma } from "#database/client.js";
import {
  createRedisClient,
  parseRedisConnectionOption,
  InvalidationBus,
  RedisKeys,
  RedisTTL,
} from "#database/redis.js";
import { RabbitClient } from "#lib/rabbit.js";
import {
  createEventBus,
  RawGatewayConsumer,
  type OwnedEventBus,
} from "@ember/event-bus";
import { installPreDeferredInteractions } from "#core/lib/pre-deferred-interactions.js";
import { buildRestOptions } from "#core/lib/discord-rest.js";
import { WorkerManager } from "#workers/WorkerManager.js";
import { ModuleStore } from "#core/module-system/ModuleStore.js";

import { DatabaseService } from "#root/prisma/DatabaseService.js";
import { ServiceStore } from "#core/module-system/ServiceStore.js";
import { BotConfig } from "#utilities/config.js";
import { PinoSapphireLogger } from "#core/logging/PinoLogger.js";
import {
  streamLength,
  streamConsumerLag,
  streamDlqLength,
} from "@ember/observability";
import {
  planShards,
  buildSimpleThrottlerFactory,
  attachCluster,
  type ShardPlan,
  type ClusterBootstrap,
} from "@ember/sharding";
import { Redis } from "ioredis";
import type { SessionInfo } from "@discordjs/ws";

export interface EmberClientOptions {
  /** Override the role derived from EMBER_ROLE. */
  role?: EmberRole;
  /**
   * Pre-fetched shard plan from `@ember/sharding`. Required for the monolith
   * role (it drives `shardCount`/`shards`/`buildIdentifyThrottler`). Workers
   * never open a Discord WS so the plan is ignored there.
   * Use `EmberClient.bootstrap()` to fetch it for you.
   */
  shardPlan?: ShardPlan;
  /**
   * Optional cluster bootstrap from `attachCluster()`. When supplied, its
   * `shards` override the plan's, its `sessionStore` drives
   * retrieve/updateSessionInfo, and its `throttlerFactory` replaces the
   * single-process SimpleIdentifyThrottler. Built by `EmberClient.bootstrap()`
   * when `CLUSTER_NAME` is set.
   */
  cluster?: ClusterBootstrap;
  /** Internal: Redis pair owned by bootstrap() so destroy() can close them. */
  _clusterRedis?: { redis: Redis; subscriber: Redis };
}

export class EmberClient extends SapphireClient {
  private _livenessInterval: ReturnType<typeof setInterval> | null = null;
  private _ownedEventBus: OwnedEventBus | null = null;
  private _rawConsumer: RawGatewayConsumer | null = null;
  private _schedulerRequestConsumer: SchedulerRequestConsumer | null = null;
  private _taskFireConsumer: TaskFireConsumer | null = null;
  private _cluster: ClusterBootstrap | null = null;
  private _clusterRedis: { redis: Redis; subscriber: Redis } | null = null;
  public readonly role: EmberRole;

  /**
   * Async factory that resolves a shard plan via `/gateway/bot` before
   * constructing the client. For the `worker` role (WS disabled), shard
   * planning is skipped. Use this from app entrypoints; the bare constructor
   * is fine in tests where you can stub the plan.
   */
  public static async bootstrap(
    options: EmberClientOptions = {},
  ): Promise<EmberClient> {
    const role = options.role ?? getEmberRole();
    if (
      role === "worker" ||
      role === "scheduler" ||
      options.shardPlan !== undefined
    ) {
      return new EmberClient(options);
    }
    const log = (
      level: "info" | "warn" | "error",
      msg: string,
      meta?: object,
    ) => {
      const line = meta
        ? `[EmberClient] ${msg} ${JSON.stringify(meta)}`
        : `[EmberClient] ${msg}`;
      const fn =
        level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[fn](line);
    };
    const shardPlan = await planShards({
      token: envParseString("BOT_TOKEN"),
      log,
    });

    const clusterName = getClusterName();
    if (!clusterName) {
      return new EmberClient({ ...options, shardPlan });
    }

    // Monolith + cluster: build a Redis pair and join. On a rebalance we
    // gracefully exit; the orchestrator will bring a new process up which
    // RESUMEs via the shared session store (S3.3).
    const redisOpts = {
      host: envParseString("REDIS_HOST", "localhost"),
      port: envParseInteger("REDIS_PORT", 6379),
      password: envParseString("REDIS_PASSWORD", ""),
      db: envParseInteger("REDIS_CACHE_DB", 0),
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    const redis = new Redis(redisOpts);
    const subscriber = new Redis(redisOpts);
    await redis.connect();
    await subscriber.connect();
    const replicaId =
      process.env["EMBER_CONSUMER_ID"] ||
      process.env["HOSTNAME"] ||
      `monolith-${process.pid}`;
    const cluster = await attachCluster({
      plan: shardPlan,
      redis,
      subscriber,
      clusterName,
      replicaId,
      log,
    });
    const client = new EmberClient({
      ...options,
      shardPlan,
      cluster,
      _clusterRedis: { redis, subscriber },
    });
    cluster.coordinator.onRebalance((delta) => {
      log("warn", "shard assignment changed — draining for restart", {
        added: delta.added,
        removed: delta.removed,
      });
      void client.destroy().finally(() => process.exit(0));
    });
    return client;
  }

  public constructor(options: EmberClientOptions = {}) {
    const role = options.role ?? getEmberRole();
    super({
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,
        PresenceManager: 0,
        ReactionManager: 0,
        GuildMemberManager: 50,
        ThreadManager: 25,
        UserManager: 200,
        StageInstanceManager: 0,
        VoiceStateManager: 0,
        GuildScheduledEventManager: 0,
        AutoModerationRuleManager: 0,
        GuildBanManager: 0,
        GuildInviteManager: 0,
        GuildEmojiManager: 0,
        GuildStickerManager: 0,
        BaseGuildEmojiManager: 0,
        ApplicationCommandManager: 0,
        ApplicationEmojiManager: 0,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 300, lifetime: 600 },
        users: {
          interval: 3600,
          filter: () => (user) => user.bot && user.id !== user.client.user.id,
        },
        threads: { interval: 3600, lifetime: 3600 },
        guildMembers: {
          interval: 1800,
          filter: Sweepers.filterByLifetime({
            lifetime: 1800,
            excludeFromSweep: (m) => m.id === m.client.user.id,
          }),
        },
      },
      ...(options.shardPlan && {
        shardCount: options.shardPlan.shardCount,
        ...((options.cluster?.shards ?? options.shardPlan.shards) && {
          shards: [...(options.cluster?.shards ?? options.shardPlan.shards!)],
        }),
        ws: {
          buildIdentifyThrottler:
            options.cluster?.throttlerFactory ??
            buildSimpleThrottlerFactory(options.shardPlan),
          ...(options.cluster && {
            retrieveSessionInfo: (shardId: number) =>
              options.cluster!.sessionStore.retrieve(shardId),
            updateSessionInfo: (shardId: number, info: SessionInfo | null) =>
              options.cluster!.sessionStore.update(shardId, info),
          }),
        },
      }),
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.GuildMember],
      allowedMentions: { parse: ["users"], repliedUser: true },
      presence: {
        activities: [
          {
            name: BotConfig.presence.activityText,
            type: BotConfig.presence.activityType,
          },
        ],
        status: BotConfig.presence.status as PresenceStatusData,
      },
      loadMessageCommandListeners: true,
      loadDefaultErrorListeners: false,
      loadScheduledTaskErrorListeners: false,
      baseUserDirectory: new URL("../", import.meta.url),
      defaultPrefix: envParseString("DEFAULT_PREFIX", ","),
      fetchPrefix: (m) => this._fetchPrefix(m),
      logger: {
        instance: new PinoSapphireLogger(),
      },
      tasks: {
        bull: {
          connection: {
            ...parseRedisConnectionOption(),
            db: envParseInteger("REDIS_TASK_DB", 1),
          },
        },
      },
      // S4: route all of discord.js' internal REST through the shared proxy
      // when DISCORD_PROXY_URL is set. The proxy holds the authoritative
      // bucket state across every worker replica.
      rest: buildRestOptions(),
      api: {
        prefix: "/",
        origin: envParseString("API_ORIGIN", "http://localhost:4000"),
        listenOptions: {
          port: envParseInteger("API_PORT", 4000),
        },
      },
    });

    // 1. Module system setup
    const moduleStore = new ModuleStore();
    moduleStore.addRoot(new URL("../modules/", import.meta.url));
    this.stores.register(new ServiceStore());
    this.stores.register(moduleStore);
    this.stores.registerPath(new URL("../core/", import.meta.url));
    this.stores.registerPath(new URL("../core/permissions/", import.meta.url));
    this.stores
      .get("listeners")
      .registerPath(new URL("../core/sentry/", import.meta.url));

    // 2. Container injection — Object.assign bypasses readonly (intentional: only
    //    the constructor may initialise these; everywhere else they are immutable).
    const redis = createRedisClient();
    // Event bus: inproc by default (no behavioral change vs the monolith). Set
    // TRANSPORT=streams to publish/consume raw gateway packets via Redis Streams.
    // Streams mode is wired but not yet driving dispatch — see TODO.md S2 slice 2.
    this._ownedEventBus = createEventBus({
      redis: {
        host: envParseString("REDIS_HOST", "localhost"),
        port: envParseInteger("REDIS_PORT", 6379),
        password: envParseString("REDIS_PASSWORD", ""),
        db: envParseInteger("REDIS_CACHE_DB", 0),
      },
      defaultMaxLen: envParseInteger("EVENT_STREAM_MAXLEN", 100_000),
      maxDeliveries: envParseInteger("EVENT_STREAM_MAX_DELIVERIES", 5),
      claimMinIdleMs: envParseInteger("EVENT_STREAM_CLAIM_MIN_IDLE_MS", 60_000),
      claimIntervalMs: envParseInteger(
        "EVENT_STREAM_CLAIM_INTERVAL_MS",
        30_000,
      ),
      statsIntervalMs: envParseInteger(
        "EVENT_STREAM_STATS_INTERVAL_MS",
        10_000,
      ),
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
      db: new DatabaseService(prisma, redis, container.logger),
      eventBus: this._ownedEventBus.bus,
      eventBusTransport: this._ownedEventBus.transport,
      modules: Object.create(
        null,
      ) as import("#core/types/common.js").ModuleServiceStore,
      moduleStore,
      workers: new WorkerManager(),
      configChangeHooks: new Map(),
      stats: {
        messages: 0,
        identifies: 0,
        resumes: 0,
        lastIdentify: null,
        lastResume: null,
      },
    });

    ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
      RegisterBehavior.BulkOverwrite,
    );

    // 3. Stats tracking
    this.on("messageCreate", (m) => {
      if (!m.author.bot) container.stats.messages++;
    });

    this.role = role;
    this._cluster = options.cluster ?? null;
    this._clusterRedis = options._clusterRedis ?? null;
  }

  public override async login(token?: string) {
    await container.prisma.$connect();
    await container.invalidation.start();

    const rabbitUrl = envParseString("RABBITMQ_URL");
    container.rabbit = new RabbitClient(rabbitUrl);

    // 1. Wait for connection with a 15s timeout
    try {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        container.rabbit.waitForConnect(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("RabbitMQ connection timeout")),
            15_000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
    } catch (err: unknown) {
      container.logger.error(
        "[RabbitMQ] Connection failed or timed out. Background tasks will be unavailable.",
        err,
      );
    }

    await this.stores.get("modules").discover();

    // In `worker` and `scheduler` roles we don't open a Discord WS — packets
    // arrive via the event bus (S2 slice 2). We still want everything Sapphire
    // does at login (load stores, sync application commands on READY, etc.),
    // so we keep `super.login()` but monkey-patch `ws.connect` to a no-op. The
    // gateway service is the only process holding a WS connection.
    if (this.role === "worker" || this.role === "scheduler") {
      this._installWorkerPatches();
    }

    const result = await super.login(token);

    // 2. Start consumers if connected
    if (container.rabbit.connected) {
      container.rabbit.startConsumers();
    }

    // S5: Scheduler request consumer — translates RequestEnvelopes (workers
    // asking to enqueue/cancel BullMQ jobs) into local container.tasks calls.
    // Runs only where BullMQ is owned (scheduler, monolith).
    if (roleOwnsScheduler(this.role)) {
      this._schedulerRequestConsumer = new SchedulerRequestConsumer(
        container.eventBus,
        { consumerId: getConsumerId() },
      );
      await this._schedulerRequestConsumer.start();
      container.logger.info(
        `[Scheduler] Request consumer started (consumerId=${getConsumerId()})`,
      );
    }

    // S5: Task-fire consumer — receives FireEnvelopes published by the
    // scheduler when a BullMQ job comes due, and runs the registered
    // worker-side handler (Discord + DB side-effects). Runs on roles that
    // execute task effects (worker, monolith).
    if (roleExecutesTaskEffects(this.role)) {
      registerCoreFireHandlers();
      this._taskFireConsumer = new TaskFireConsumer(container.eventBus, {
        consumerId: getConsumerId(),
      });
      await this._taskFireConsumer.start();
    }

    // 3. Start raw-gateway consumer (only when the bus carries packets to us).
    if (this.role === "worker" && container.eventBusTransport === "streams") {
      this._rawConsumer = new RawGatewayConsumer(
        container.eventBus,
        this as unknown as {
          ws: {
            handlePacket: (packet: unknown, shard: { id: number }) => boolean;
          };
        },
        {
          consumerId: getConsumerId(),
          log: (level, msg, meta) =>
            container.logger[level](`[RawConsumer] ${msg}`, meta),
        },
      );
      await this._rawConsumer.start();
      container.logger.info(
        `[Worker] Raw gateway consumer started (consumerId=${getConsumerId()})`,
      );
    }

    // 3. Database Liveness Check
    this._livenessInterval = setInterval(async () => {
      try {
        await container.prisma.$queryRaw`SELECT 1`;
      } catch (err: unknown) {
        container.logger.error("[Database] Liveness check failed:", err);
      }
    }, 60_000);

    return result;
  }

  private _installWorkerPatches() {
    // 1. No-op the WS connect: super.login() won't open a socket.
    const ws = this.ws as unknown as { connect: () => Promise<void> };
    ws.connect = async () => {
      container.logger.info(
        "[Worker] ws.connect() suppressed — packets arrive via event bus",
      );
    };

    // 2. If the gateway pre-acks interactions, patch Interaction.deferReply/Update
    //    so worker handlers don't double-ack and 40060.
    if (isInteractionDeferAtGateway()) {
      installPreDeferredInteractions((msg) => container.logger.info(msg));
    }
  }

  public override async destroy() {
    if (this._livenessInterval) {
      clearInterval(this._livenessInterval);
      this._livenessInterval = null;
    }
    if (this._rawConsumer) {
      await this._rawConsumer
        .stopConsuming()
        .catch((err) =>
          container.logger.warn("[Client] RawConsumer stop failed:", err),
        );
      this._rawConsumer = null;
    }
    if (this._taskFireConsumer) {
      await this._taskFireConsumer
        .stopConsuming()
        .catch((err) =>
          container.logger.warn("[Client] TaskFireConsumer stop failed:", err),
        );
      this._taskFireConsumer = null;
    }
    if (this._schedulerRequestConsumer) {
      await this._schedulerRequestConsumer
        .stopConsuming()
        .catch((err) =>
          container.logger.warn(
            "[Client] SchedulerRequestConsumer stop failed:",
            err,
          ),
        );
      this._schedulerRequestConsumer = null;
    }
    await super.destroy();
    await container.workers.destroy();
    await container.rabbit?.close();
    await this._ownedEventBus
      ?.close()
      .catch((err) =>
        container.logger.warn("[Client] EventBus close failed:", err),
      );
    this._ownedEventBus = null;
    if (this._cluster) {
      await this._cluster
        .close()
        .catch((err) =>
          container.logger.warn("[Client] Cluster close failed:", err),
        );
      this._cluster = null;
    }
    if (this._clusterRedis) {
      await Promise.allSettled([
        this._clusterRedis.redis.quit(),
        this._clusterRedis.subscriber.quit(),
      ]);
      this._clusterRedis = null;
    }
    await container.invalidation.stop();
    await container.redis
      .quit()
      .catch((err) =>
        container.logger.warn("[Client] Redis quit failed:", err),
      );
    await container.prisma
      .$disconnect()
      .catch((err) =>
        container.logger.warn("[Client] Prisma disconnect failed:", err),
      );
  }

  private async _fetchPrefix(message: Message) {
    if (!message.guild) return envParseString("DEFAULT_PREFIX", ",");

    const cacheKey = RedisKeys.guildPrefixes(message.guild.id);
    const cached = await container.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as string[];

    const settings = await container.db.config.getGuildSettings(
      message.guild.id,
    );
    const fallback = envParseString("DEFAULT_PREFIX", ",");
    const prefixes = settings.prefix ? [settings.prefix] : [fallback];

    await container.redis.setex(
      cacheKey,
      RedisTTL.guildPrefix,
      JSON.stringify(prefixes),
    );
    return prefixes;
  }
}
