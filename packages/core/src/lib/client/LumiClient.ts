import { createRedisClient, RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { installEntityPopulator } from "#lib/entity-cache/entity-populator.js";
import {
  envParseInteger,
  envParseString,
  getConsumerId,
  getServiceRole,
  isEntityCachePopulateEnabled,
  roleExecutesTaskEffects,
  roleOwnsScheduler,
  type ServiceRole,
} from "#lib/env.js";
import { registerCoreFireHandlers } from "#lib/core-fire-handlers.js";
import { flushAllMessageDeletes } from "#lib/rest-coalesce.js";
import { initCoreRpcHandlers } from "#lib/rpc/core-rpc.js";
import { startRpcHttpServer } from "#lib/rpc/http-server.js";
import { SchedulerLeaderLock } from "#lib/scheduler-leader-lock.js";
import { TaskFireConsumer } from "#lib/task-fire-registry.js";
import type { OwnedEventBus } from "@lumi/event-bus";
import { failedJobsTotal } from "@lumi/observability";
import { planShards, type ShardPlan } from "@lumi/sharding";
import {
  ApplicationCommandRegistries,
  PluginHook,
  RegisterBehavior,
  SapphireClient,
  container,
} from "@sapphire/framework";
import "@sapphire/plugin-hmr/register";
import { tryParseJSON } from "@sapphire/utilities";
import type { Message } from "discord.js";
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
 * internal RPC server, module discovery - and only then hands over to Sapphire.
 * `destroy()` unwinds that in reverse, and every step swallows its own
 * failure so one unreachable resource cannot strand the others.
 */
export class LumiClient extends SapphireClient {
  public readonly role: ServiceRole;

  private _livenessInterval: ReturnType<typeof setInterval> | null = null;
  private _ownedEventBus: OwnedEventBus | null = null;
  private _detachEntityPopulator: (() => void) | null = null;
  private _taskFireConsumer: TaskFireConsumer | null = null;
  private _schedulerLeaderLock: SchedulerLeaderLock | null = null;

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

    initCoreRpcHandlers();
    startRpcHttpServer((level, msg, meta) => container.logger[level](msg, meta));
    await this.stores.get("modules").discover();

    const result =
      this.role === "scheduler"
        ? await this.loginWithoutGateway(token)
        : await super.login(token);

    if (roleOwnsScheduler(this.role)) {
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

  /**
   * Sapphire's `login()` sequence with the Discord WebSocket connection left
   * out: register the piece paths, run the plugin hooks, load every store.
   *
   * @remarks
   *
   * The scheduler owns BullMQ and relays every fire onto the bus for a worker
   * to execute - it has no use for gateway events. Letting `super.login()` run
   * there would spawn a full set of shards per scheduler replica, burn the
   * daily IDENTIFY budget, and - because the same listeners and commands are
   * loaded in every role - make the scheduler answer commands and react to
   * events a second time alongside the workers.
   *
   * REST still works: the token is set on the REST manager, so a task effect
   * that reaches Discord over HTTP is unaffected.
   */
  private async loginWithoutGateway(token?: string): Promise<string> {
    const resolved = token ?? this.token;
    if (resolved) {
      this.token = resolved;
      this.rest.setToken(resolved);
    }

    if (this.options.baseUserDirectory !== null) {
      this.stores.registerPath(this.options.baseUserDirectory);
    }
    for (const plugin of LumiClient.plugins.values(PluginHook.PreLogin)) {
      await plugin.hook.call(this, this.options);
    }
    await Promise.all([...this.stores.values()].map((store) => store.loadAll()));
    for (const plugin of LumiClient.plugins.values(PluginHook.PostLogin)) {
      await plugin.hook.call(this, this.options);
    }

    return resolved ?? "";
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
    await this._ownedEventBus
      ?.close()
      .catch(warnOnCleanupError("EventBus close"));
    this._ownedEventBus = null;
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

    return new LumiClient({ ...options, shardPlan });
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
  }
}
