import {
  SapphireClient,
  container,
  ApplicationCommandRegistries,
  RegisterBehavior,
  LogLevel,
} from "@sapphire/framework";
import { PinoSapphireLogger } from "#lib/logging/PinoSapphireLogger.js";
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
  getServiceRole,
  getConsumerId,
  getClusterName,
  getDevModulePaths,
  isInteractionDeferAtGateway,
  isEntityCachePopulateEnabled,
  roleOwnsScheduler,
  roleExecutesTaskEffects,
  type ServiceRole,
} from "#lib/env.js";
import { SchedulerRequestConsumer } from "#lib/scheduler-request-consumer.js";
import { TaskFireConsumer } from "#lib/task-fire-registry.js";
import { registerCoreFireHandlers } from "#lib/core-fire-handlers.js";
import { prisma } from "#lib/prisma/client.js";
import {
  createRedisClient,
  parseRedisConnectionOption,
  redisConnectionOptions,
  InvalidationBus,
  RedisKeys,
  RedisTTL,
} from "#lib/database/redis.js";
import { flushAllMessageDeletes } from "#lib/rest-coalesce.js";
import { SchedulerLeaderLock } from "#lib/scheduler-leader-lock.js";
import { RabbitClient } from "#lib/rabbitmq/index.js";
import {
  createEventBus,
  RawGatewayConsumer,
  type OwnedEventBus,
} from "@lumi/event-bus";
import { installPreDeferredInteractions } from "#lib/pre-deferred-interactions.js";
import { buildRestOptions } from "#lib/discord-rest.js";
import { RedisEntityCache } from "#lib/entity-cache/RedisEntityCache.js";
import { installEntityPopulator } from "#lib/entity-cache/entity-populator.js";
import { ModuleStore } from "#lib/module-system/ModuleStore.js";
import { ADDON_MODULES_ROOT } from "#lib/downloader/resolver.js";
import { pathToFileURL } from "node:url";

import { DatabaseService } from "#lib/prisma/DatabaseService.js";
import { ServiceStore } from "#lib/module-system/ServiceStore.js";
import { BotConfig } from "#lib/utilities/config.js";
import { buildI18nOptions } from "#lib/i18n/index.js";

import {
  streamLength,
  streamConsumerLag,
  streamDlqLength,
  failedJobsTotal,
  registerReadinessProbe,
} from "@lumi/observability";
import {
  planShards,
  buildSimpleThrottlerFactory,
  attachCluster,
  ClusterReadyTracker,
  type ShardPlan,
  type ClusterBootstrap,
} from "@lumi/sharding";
import { Redis } from "ioredis";
import { tryParseJSON } from "@sapphire/utilities";

export interface LumiClientOptions {
  /** Override the role derived from LUMI_ROLE. */
  role?: ServiceRole;
  /**
   * Pre-fetched shard plan from `@lumi/sharding`. Required for the monolith
   * role (it drives `shardCount`/`shards`/`buildIdentifyThrottler`). Workers
   * never open a Discord WS so the plan is ignored there.
   * Use `LumiClient.bootstrap()` to fetch it for you.
   */
  shardPlan?: ShardPlan;
  /**
   * Optional cluster bootstrap from `attachCluster()`. When supplied, its
   * `shards` override the plan's, its `sessionStore` drives
   * retrieve/updateSessionInfo, and its `throttlerFactory` replaces the
   * single-process SimpleIdentifyThrottler. Built by `LumiClient.bootstrap()`
   * when `CLUSTER_NAME` is set.
   */
  cluster?: ClusterBootstrap;
  /** Internal: Redis pair owned by bootstrap() so destroy() can close them. */
  _clusterRedis?: { redis: Redis; subscriber: Redis };
}

/**
 * The primary client for Lumi, extending {@link SapphireClient}.
 * Responsibilities include setting up the module system, connecting to the event bus,
 * managing the Redis cache, and initializing database connections.
 */
export class LumiClient extends SapphireClient {
  public readonly role: ServiceRole;
  private _livenessInterval: ReturnType<typeof setInterval> | null = null;
  private _ownedEventBus: OwnedEventBus | null = null;
  private _rawConsumer: RawGatewayConsumer | null = null;
  private _detachEntityPopulator: (() => void) | null = null;
  private _schedulerRequestConsumer: SchedulerRequestConsumer | null = null;
  private _taskFireConsumer: TaskFireConsumer | null = null;
  private _schedulerLeaderLock: SchedulerLeaderLock | null = null;
  private _cluster: ClusterBootstrap | null = null;
  private _clusterRedis: { redis: Redis; subscriber: Redis } | null = null;

  /**
   * Constructs a new instance of the LumiClient.
   *
   * @param options - The options to configure the client.
   */
  public constructor(options: LumiClientOptions = {}) {
    const role = options.role ?? getServiceRole();
    super({
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 50,
        ReactionManager: 0,
        GuildMemberManager: 50,
        ThreadManager: 25,
        UserManager: 200,
        StageInstanceManager: 0,
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
            retrieveSessionInfo: options.cluster.sessionStore.retrieve.bind(
              options.cluster.sessionStore,
            ),
            updateSessionInfo: options.cluster.sessionStore.update.bind(
              options.cluster.sessionStore,
            ),
          }),
        },
      }),
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
      ],
      partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
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
      baseUserDirectory: new URL("../../", import.meta.url),
      defaultPrefix: envParseString("DEFAULT_PREFIX", ","),
      logger: {
        instance: new PinoSapphireLogger(
          process.env["SERVICE_NAME"] ?? getServiceRole(),
          process.env["NODE_ENV"] === "development"
            ? LogLevel.Debug
            : LogLevel.Info,
        ),
      },
      hmr: {
        enabled: process.env["NODE_ENV"] === "development",
      },
      i18n: buildI18nOptions(),
      tasks: {
        bull: {
          connection: {
            ...parseRedisConnectionOption(),
            db: envParseInteger("REDIS_TASK_DB", 1),
          },
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        },
      },
      rest: buildRestOptions(),
    });

    const moduleStore = new ModuleStore();
    moduleStore.addRoot(new URL("../../modules/", import.meta.url));
    moduleStore.addRoot(pathToFileURL(`${ADDON_MODULES_ROOT}/`));
    for (const devPath of getDevModulePaths()) {
      moduleStore.addRoot(pathToFileURL(`${devPath}/`));
    }
    this.stores.register(new ServiceStore());
    this.stores.register(moduleStore);
    this.stores.registerPath(new URL("../permissions/", import.meta.url));
    (this.stores.get("services") as any).registerPath(
      new URL("../services/", import.meta.url),
    );
    (this.stores.get("utilities") as any).registerPath(
      new URL("../utility-store/", import.meta.url),
    );

    const redis = createRedisClient();
    this._ownedEventBus = createEventBus({
      redis: {
        ...redisConnectionOptions(),
        db: envParseInteger("REDIS_CACHE_DB", 0),
      },
      natsServers: process.env["NATS_URL"] ?? process.env["NATS_SERVERS"],
      natsUser: process.env["NATS_USER"],
      natsPass: process.env["NATS_PASSWORD"],
      defaultMaxLen: envParseInteger("EVENT_STREAM_MAXLEN", 100_000),
      maxDeliveries: envParseInteger("EVENT_STREAM_MAX_DELIVERIES", 5),
      claimMinIdleMs: envParseInteger("EVENT_STREAM_CLAIM_MIN_IDLE_MS", 60_000),
      ackWaitMs: envParseInteger("EVENT_STREAM_ACK_WAIT_MS", 60_000),
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
      entityCache: new RedisEntityCache(redis),
      eventBus: this._ownedEventBus.bus,
      eventBusTransport: this._ownedEventBus.transport,
      moduleStore,
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

    this.on("messageCreate", (m) => {
      if (!m.author.bot) container.stats.messages++;
    });

    this.role = role;
    this._cluster = options.cluster ?? null;
    this._clusterRedis = options._clusterRedis ?? null;
  }

  /**
   * Authenticates the client with the Discord API and starts necessary consumers.
   *
   * @param token - The token used to log in. If not provided, it falls back to the environment variable.
   * @returns The token used to log in as a string.
   */
  public override async login(token?: string) {
    await container.prisma.$connect();
    await container.invalidation.start();

    if (
      this.role === "scheduler" &&
      envParseString("SCHEDULER_LEADER_LOCK", "false") === "true"
    ) {
      this._schedulerLeaderLock = new SchedulerLeaderLock({
        redis: createRedisClient(),
        replicaId: getConsumerId(),
        ttlMs: envParseInteger("SCHEDULER_LEADER_LOCK_TTL_MS", 30_000),
        renewIntervalMs: envParseInteger(
          "SCHEDULER_LEADER_LOCK_RENEW_MS",
          10_000,
        ),
        pollIntervalMs: envParseInteger("SCHEDULER_LEADER_LOCK_POLL_MS", 2_000),
        log: (level: string, msg: string, meta?: any) =>
          container.logger[
            level as "info" | "warn" | "error" | "fatal" | "debug" | "trace"
          ](msg, meta),
        onLost: (reason: string) => {
          container.logger.fatal(
            `[Scheduler] Leadership lost (${reason}); exiting for orchestrator restart`,
          );
          process.exit(1);
        },
      });
      await this._schedulerLeaderLock.acquire();
    }

    const rabbitUrl = envParseString("RABBITMQ_URL");
    container.rabbit = new RabbitClient(rabbitUrl);

    try {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        container.rabbit.channel.waitForConnect(),
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

    if (this.role === "worker" || this.role === "scheduler") {
      this._installWorkerPatches();
    }

    const result = await super.login(token);

    if (container.rabbit.connected) {
      container.rabbit.startConsumers();
    }

    if (roleOwnsScheduler(this.role)) {
      this._schedulerRequestConsumer = new SchedulerRequestConsumer(
        container.eventBus,
        { consumerId: getConsumerId() },
      );
      await this._schedulerRequestConsumer.start();
      container.logger.info(
        `[Scheduler] Request consumer started (consumerId=${getConsumerId()})`,
      );

      const bullWorker = (
        container.tasks as unknown as {
          worker?: {
            on(event: string, fn: (...args: unknown[]) => void): void;
          };
        }
      ).worker;
      if (bullWorker) {
        bullWorker.on("failed", (job: unknown, err: unknown) => {
          const taskName =
            (job as { name?: string } | undefined)?.name ?? "unknown";
          const attemptsMade =
            (job as { attemptsMade?: number } | undefined)?.attemptsMade ?? 0;
          const maxAttempts =
            (job as { opts?: { attempts?: number } } | undefined)?.opts
              ?.attempts ?? 0;
          if (attemptsMade >= maxAttempts) {
            failedJobsTotal.inc({ task: taskName });
            container.logger.error(
              `[Scheduler] Job '${taskName}' failed after ${attemptsMade} attempt(s):`,
              err,
            );
          }
        });
      }
    }

    if (roleExecutesTaskEffects(this.role)) {
      registerCoreFireHandlers();
      this._taskFireConsumer = new TaskFireConsumer(container.eventBus, {
        consumerId: getConsumerId(),
      });
      await this._taskFireConsumer.start();
    }

    if (this.role === "worker" && container.eventBusTransport === "streams") {
      const clusterName = getClusterName();
      if (clusterName) {
        const tracker = new ClusterReadyTracker({
          redis: container.redis,
          clusterName,
        });
        if (!(await tracker.isReady())) {
          container.logger.info(
            `[Worker] Waiting for cluster '${clusterName}' to report ready before consuming...`,
          );
          await tracker.waitForReady();
          container.logger.info("[Worker] Cluster ready; starting consumer.");
        }
      }
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

    if (
      (this.role === "monolith" || this.role === "worker") &&
      isEntityCachePopulateEnabled()
    ) {
      this._detachEntityPopulator = installEntityPopulator(
        container.entityCache,
      );
    }

    this._livenessInterval = setInterval(async () => {
      try {
        await container.prisma.$queryRaw`SELECT 1`;
      } catch (err: unknown) {
        container.logger.error("[Database] Liveness check failed:", err);
      }
    }, 60_000);

    this._registerReadinessProbes();

    return result;
  }

  /**
   * Destroys the client, cleanly stopping all consumers and closing connections
   * to Redis, RabbitMQ, and the database.
   */
  public override async destroy() {
    if (this._livenessInterval) {
      clearInterval(this._livenessInterval);
      this._livenessInterval = null;
    }
    if (this._detachEntityPopulator) {
      this._detachEntityPopulator();
      this._detachEntityPopulator = null;
    }
    if (this._rawConsumer) {
      await this._rawConsumer
        .stopConsuming()
        .catch(this._warnOnCleanupError("RawConsumer stop"));
      this._rawConsumer = null;
    }
    if (this._taskFireConsumer) {
      await this._taskFireConsumer
        .stopConsuming()
        .catch(this._warnOnCleanupError("TaskFireConsumer stop"));
      this._taskFireConsumer = null;
    }
    if (this._schedulerRequestConsumer) {
      await this._schedulerRequestConsumer
        .stopConsuming()
        .catch(this._warnOnCleanupError("SchedulerRequestConsumer stop"));
      this._schedulerRequestConsumer = null;
    }
    if (this._schedulerLeaderLock) {
      await this._schedulerLeaderLock
        .release()
        .catch(this._warnOnCleanupError("SchedulerLeaderLock release"));
      this._schedulerLeaderLock = null;
    }
    await super.destroy();
    await flushAllMessageDeletes().catch(
      this._warnOnCleanupError("flushAllMessageDeletes"),
    );
    await container.rabbit?.close();
    await this._ownedEventBus
      ?.close()
      .catch(this._warnOnCleanupError("EventBus close"));
    this._ownedEventBus = null;
    if (this._cluster) {
      await this._cluster
        .close()
        .catch(this._warnOnCleanupError("Cluster close"));
      this._cluster = null;
    }
    if (this._clusterRedis) {
      await Promise.allSettled([
        this._clusterRedis.redis.quit(),
        this._clusterRedis.subscriber.quit(),
      ]);
      this._clusterRedis = null;
    }
    await container.invalidation.close();
    await container.redis.quit().catch(this._warnOnCleanupError("Redis quit"));
    await container.prisma
      .$disconnect()
      .catch(this._warnOnCleanupError("Prisma disconnect"));
  }

  /** Cleanup-error handler used throughout destroy(): log at warn, never throw. */
  public override fetchPrefix = async (message: Message) => {
    const globalConfig = await container.db.global
      .getGlobalConfig()
      .catch(() => null);
    const envFallback = envParseString("DEFAULT_PREFIX", ",");
    const globalDefault = globalConfig?.defaultPrefix ?? envFallback;

    if (!message.guild) return globalDefault;

    const cacheKey = RedisKeys.guildPrefixes(message.guild.id);
    const cached = await container.redis.get(cacheKey);
    if (cached) {
      const parsed = tryParseJSON(cached) as string[] | null;
      if (Array.isArray(parsed)) return parsed;
    }

    const settings = await container.db.config.getGuildSettings(
      message.guild.id,
    );
    const prefixes = settings.prefix ? [settings.prefix] : [globalDefault];

    await container.redis.setex(
      cacheKey,
      RedisTTL.guildPrefix,
      JSON.stringify(prefixes),
    );
    return prefixes;
  };

  private _warnOnCleanupError(what: string) {
    return (err: unknown) =>
      container.logger.warn(`[Client] ${what} failed:`, err);
  }

  private _registerReadinessProbes() {
    registerReadinessProbe("postgres", async () => {
      try {
        await container.prisma.$queryRaw`SELECT 1`;
        return { status: "ok" };
      } catch (err) {
        return { status: "fail", detail: String(err) };
      }
    });

    registerReadinessProbe("redis", async () => {
      try {
        const pong = await container.redis.ping();
        return pong === "PONG"
          ? { status: "ok" }
          : { status: "fail", detail: `unexpected ping reply: ${pong}` };
      } catch (err) {
        return { status: "fail", detail: String(err) };
      }
    });

    registerReadinessProbe("rabbitmq", () =>
      container.rabbit?.connected
        ? { status: "ok" }
        : { status: "fail", detail: "not connected" },
    );

    if (this.role === "monolith") {
      registerReadinessProbe("discord", () =>
        this.isReady()
          ? { status: "ok" }
          : { status: "fail", detail: "client not ready" },
      );
    }

    if (this.role === "worker" && container.eventBusTransport === "streams") {
      registerReadinessProbe("raw-gateway-consumer", () =>
        this._rawConsumer
          ? { status: "ok" }
          : { status: "fail", detail: "consumer not started" },
      );
    }

    if (roleOwnsScheduler(this.role)) {
      registerReadinessProbe("scheduler-tasks", () =>
        container.tasks
          ? { status: "ok" }
          : { status: "fail", detail: "tasks store missing" },
      );
      if (this._schedulerLeaderLock) {
        registerReadinessProbe("scheduler-leader", () =>
          this._schedulerLeaderLock?.isLeader()
            ? { status: "ok" }
            : { status: "fail", detail: "not leader" },
        );
      }
    }
  }

  private _installWorkerPatches() {
    const ws = this.ws as unknown as { connect: () => Promise<void> };
    ws.connect = () => {
      container.logger.info(
        "[Worker] ws.connect() suppressed — packets arrive via event bus",
      );
      return Promise.resolve();
    };

    if (isInteractionDeferAtGateway()) {
      installPreDeferredInteractions((msg: string) =>
        container.logger.info(msg),
      );
    }
  }

  /**
   * Async factory that resolves a shard plan via `/gateway/bot` before
   * constructing the client. For the `worker` role (WS disabled), shard
   * planning is skipped.
   *
   * @param options - Additional options for client construction.
   * @returns A fully constructed and initialized {@link LumiClient}.
   */
  public static async bootstrap(
    options: LumiClientOptions = {},
  ): Promise<LumiClient> {
    const role = options.role ?? getServiceRole();
    if (
      role === "worker" ||
      role === "scheduler" ||
      options.shardPlan !== undefined
    ) {
      return new LumiClient(options);
    }
    const log = (
      level: "info" | "warn" | "error",
      msg: string,
      meta?: object,
    ) => {
      const line = meta
        ? `[LumiClient] ${msg} ${JSON.stringify(meta)}`
        : `[LumiClient] ${msg}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.info(line);
    };
    let shardPlan;
    try {
      shardPlan = await planShards({
        token: envParseString("BOT_TOKEN"),
        log,
      });
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }

    const clusterName = getClusterName();
    if (!clusterName) {
      return new LumiClient({ ...options, shardPlan });
    }

    const redisOpts = {
      ...redisConnectionOptions(),
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
      process.env["LUMI_CONSUMER_ID"] ||
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
    const client = new LumiClient({
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
}
