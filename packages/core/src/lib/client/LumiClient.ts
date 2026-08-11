import {
  createRedisClient,
  redisConnectionOptions,
  RedisKeys,
  RedisTTL,
} from "#lib/database/redis.js";
import { installEntityPopulator } from "#lib/entity-cache/entity-populator.js";
import {
  envParseInteger,
  envParseString,
  getClusterName,
  getConsumerId,
  getServiceRole,
  isEntityCachePopulateEnabled,
  roleExecutesTaskEffects,
  roleOwnsScheduler,
  type ServiceRole,
} from "#lib/env.js";
import { registerCoreFireHandlers } from "#lib/core-fire-handlers.js";
import { RabbitClient } from "#lib/rabbitmq/index.js";
import { flushAllMessageDeletes } from "#lib/rest-coalesce.js";
import { initCoreRpcHandlers } from "#lib/rpc/core-rpc.js";
import { SchedulerLeaderLock } from "#lib/scheduler-leader-lock.js";
import { SchedulerRequestConsumer } from "#lib/scheduler-request-consumer.js";
import { TaskFireConsumer } from "#lib/task-fire-registry.js";
import type { OwnedEventBus } from "@lumi/event-bus";
import { failedJobsTotal } from "@lumi/observability";
import {
  attachCluster,
  planShards,
  type ClusterBootstrap,
  type ShardPlan,
} from "@lumi/sharding";
import {
  ApplicationCommandRegistries,
  RegisterBehavior,
  SapphireClient,
  container,
} from "@sapphire/framework";
import "@sapphire/plugin-hmr/register";
import { tryParseJSON } from "@sapphire/utilities";
import type { Message } from "discord.js";
import { Redis } from "ioredis";
import { warnOnCleanupError } from "./cleanup.js";
import { buildClientOptions } from "./client-options.js";
import { installContainerServices } from "./container-services.js";
import { ReadinessProbes } from "./ReadinessProbes.js";

/**
 * The primary client for Lumi, extending {@linkcode SapphireClient}.
 *
 * @remarks
 *
 * The client composes rather than implements its start-up concerns: option
 * building, container-service installation and readiness probes each live in
 * their own module. What stays here is the ordering contract between them.
 *
 * `login()` brings resources up in dependency order - database, leader locks,
 * RabbitMQ, module discovery - and only then hands over to Sapphire.
 * `destroy()` unwinds that in reverse, and every step swallows its own
 * failure so one unreachable resource cannot strand the others.
 */
export class LumiClient extends SapphireClient {
  public readonly role: ServiceRole;

  private _livenessInterval: ReturnType<typeof setInterval> | null = null;
  private _ownedEventBus: OwnedEventBus | null = null;
  private _detachEntityPopulator: (() => void) | null = null;
  private _schedulerRequestConsumer: SchedulerRequestConsumer | null = null;
  private _taskFireConsumer: TaskFireConsumer | null = null;
  private _schedulerLeaderLock: SchedulerLeaderLock | null = null;
  private _cluster: ClusterBootstrap | null = null;
  private _clusterRedis: { redis: Redis; subscriber: Redis } | null = null;

  public constructor(options: LumiClient.Options = {}) {
    const role = options.role ?? getServiceRole();
    super(buildClientOptions(options));

    this._ownedEventBus = installContainerServices(this);

    ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
      RegisterBehavior.Overwrite,
    );

    this.on("messageCreate", (m) => {
      if (!m.author.bot) container.stats.messages++;
    });

    this.role = role;
    this._cluster = options.cluster ?? null;
    this._clusterRedis = options.clusterRedis ?? null;
  }

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

    initCoreRpcHandlers();
    await this.stores.get("modules").discover();

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

    if (this.role === "worker" && isEntityCachePopulateEnabled()) {
      this._detachEntityPopulator = installEntityPopulator(
        container.entityCache,
      );
    }

    this._livenessInterval = setInterval(async () => {
      try {
        await container.db.probePrisma();
      } catch (err: unknown) {
        container.logger.error("[Database] Liveness check failed:", err);
      }
    }, 60_000);

    new ReadinessProbes({
      role: this.role,
      isReady: () => this.isReady(),
      schedulerLeaderLock: () => this._schedulerLeaderLock,
    }).register();

    return result;
  }

  public override async destroy() {
    if (this._livenessInterval) {
      clearInterval(this._livenessInterval);
      this._livenessInterval = null;
    }
    if (this._detachEntityPopulator) {
      this._detachEntityPopulator();
      this._detachEntityPopulator = null;
    }
    if (this._taskFireConsumer) {
      await this._taskFireConsumer
        .stopConsuming()
        .catch(warnOnCleanupError("TaskFireConsumer stop"));
      this._taskFireConsumer = null;
    }
    if (this._schedulerRequestConsumer) {
      await this._schedulerRequestConsumer
        .stopConsuming()
        .catch(warnOnCleanupError("SchedulerRequestConsumer stop"));
      this._schedulerRequestConsumer = null;
    }
    if (this._schedulerLeaderLock) {
      await this._schedulerLeaderLock
        .release()
        .catch(warnOnCleanupError("SchedulerLeaderLock release"));
      this._schedulerLeaderLock = null;
    }
    await super.destroy().catch(warnOnCleanupError("Sapphire client destroy"));
    await flushAllMessageDeletes().catch(
      warnOnCleanupError("flushAllMessageDeletes"),
    );
    await container.rabbit?.close();
    await this._ownedEventBus
      ?.close()
      .catch(warnOnCleanupError("EventBus close"));
    this._ownedEventBus = null;
    if (this._cluster) {
      await this._cluster.close().catch(warnOnCleanupError("Cluster close"));
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
    await container.redis.quit().catch(warnOnCleanupError("Redis quit"));
    await container.prisma
      .$disconnect()
      .catch(warnOnCleanupError("Prisma disconnect"));
  }

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

  /**
   * Async factory that resolves a shard plan via `/gateway/bot` before
   * constructing the client. For the `scheduler` role (no WS), shard planning
   * is skipped.
   *
   * @param options - Additional options for client construction.
   * @returns A fully constructed and initialized {@linkcode LumiClient}.
   */
  public static async bootstrap(
    options: LumiClient.Options = {},
  ): Promise<LumiClient> {
    const role = options.role ?? getServiceRole();
    if (role === "scheduler" || options.shardPlan !== undefined) {
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
      `worker-${process.pid}`;
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
      clusterRedis: { redis, subscriber },
    });
    cluster.coordinator.onRebalance((delta) => {
      log("warn", "shard assignment changed - draining for restart", {
        added: delta.added,
        removed: delta.removed,
      });
      void client.destroy().finally(() => process.exit(0));
    });
    return client;
  }
}

export namespace LumiClient {
  export interface Options {
    /** Override the role derived from `LUMI_ROLE`. */
    role?: ServiceRole;
    /**
     * Pre-fetched shard plan from `@lumi/sharding`. Required for the worker
     * role - it drives `shardCount`/`shards`/`buildIdentifyThrottler`. The
     * scheduler never opens a Discord WS so the plan is ignored there. Use
     * {@linkcode LumiClient.bootstrap} to fetch it for you.
     */
    shardPlan?: ShardPlan;
    /**
     * Cluster bootstrap from `attachCluster()`. When supplied, its `shards`
     * override the plan's, its `sessionStore` drives retrieve/updateSessionInfo
     * and its `throttlerFactory` replaces the single-process
     * SimpleIdentifyThrottler. Built by {@linkcode LumiClient.bootstrap} when
     * `CLUSTER_NAME` is set.
     */
    cluster?: ClusterBootstrap;
    /**
     * Redis pair opened by {@linkcode LumiClient.bootstrap} for the cluster
     * coordinator. Ownership transfers to the client, which quits both in
     * `destroy()`.
     */
    clusterRedis?: { redis: Redis; subscriber: Redis };
  }
}
