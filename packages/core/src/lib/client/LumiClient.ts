import { Time } from "@sapphire/time-utilities";
import { disconnectDatabase } from "#lib/prisma/client.js";
import { envParseString, getConsumerId, getDefaultPrefix } from "#lib/env.js";
import { registerCoreFireHandlers } from "#lib/core-fire-handlers.js";
import { flushAllMessageDeletes } from "#lib/rest-coalesce.js";
import { TaskFireConsumer } from "#lib/task-fire-registry.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import {
  ApplicationCommandRegistries,
  RegisterBehavior,
  SapphireClient,
  container,
} from "@sapphire/framework";
import type { Message } from "discord.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { buildClientOptions } from "./client-options.js";
import { installContainerServices } from "./container-services.js";
import { installProducerOnlyTasks } from "./scheduler-producer.js";
import { ReadinessProbes } from "./ReadinessProbes.js";

// Teardown steps swallow their own failure so one unreachable resource can't strand the rest.
const warnOnCleanupError = (what: string) => (err: unknown) =>
  container.logger.warn(`[Client] ${what} failed:`, err);

/**
 * The primary client for Lumi, extending {@linkcode SapphireClient}.
 *
 * @remarks
 *
 * The client composes rather than implements its start-up concerns: option
 * building, container-service installation and readiness probes each live in
 * their own module. What stays here is the ordering contract between them.
 *
 * `login()` brings resources up in dependency order - database, module
 * discovery - and only then hands over to Sapphire. The internal RPC HTTP
 * server is no longer part of this process; it's served by `apps/api`
 * instead (see `packages/core/src/lib/client/api-bootstrap.ts`). BullMQ
 * scheduling (the scheduler lock, repeatable-job registration, the actual
 * job `Worker`) is likewise no longer part of this process - it's served by
 * `apps/scheduler` instead (see `scheduler-container-services.ts`); every
 * shard only ever enqueues a job via the producer-only `container.tasks`
 * stand-in installed below. `destroy()` unwinds what's left in reverse, and
 * every step swallows its own failure so one unreachable resource cannot
 * strand the others.
 */
export class LumiClient extends SapphireClient {
  private _livenessInterval: ReturnType<typeof setInterval> | null = null;
  private _ownedEventBus: OwnedEventBus | null = null;
  private _taskFireConsumer: TaskFireConsumer | null = null;
  private _repositoryCacheUnbind: (() => void) | null = null;

  public constructor(_options: LumiClient.Options = {}) {
    super(buildClientOptions());

    installProducerOnlyTasks();

    this._ownedEventBus = installContainerServices(this);
    this._repositoryCacheUnbind = repositoryCache.attachToInvalidationBus(
      container.invalidation,
    );

    ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
      RegisterBehavior.Overwrite,
    );

    this.on("messageCreate", (m) => {
      if (!m.author.bot) container.stats.messages++;
    });
  }

  public override async login(token?: string) {
    await container.prisma.$connect();
    await container.invalidation.start();
    await container.signals.start();

    await this.stores.get("modules").discover();

    const result = await super.login(token);

    await this.application?.fetch().catch((err: unknown) => {
      container.logger.warn("[LumiClient] Failed to fetch Discord application info:", err);
    });

    // Every shard executes fired task effects for the guilds it holds - this
    // is the event-bus relay, unrelated to which shard owns BullMQ itself.
    registerCoreFireHandlers();
    this._taskFireConsumer = new TaskFireConsumer(container.eventBus, {
      consumerId: getConsumerId(),
    });
    await this._taskFireConsumer.start();

    this._livenessInterval = setInterval(async () => {
      try {
        await container.db.probePrisma();
      } catch (err: unknown) {
        container.logger.error("[Database] Liveness check failed:", err);
      }
    }, Time.Minute);

    new ReadinessProbes({
      isReady: () => this.isReady(),
    }).register();

    return result;
  }

  public override async destroy() {
    if (this._repositoryCacheUnbind) {
      this._repositoryCacheUnbind();
      this._repositoryCacheUnbind = null;
    }
    if (this._livenessInterval) {
      clearInterval(this._livenessInterval);
      this._livenessInterval = null;
    }
    if (container.tasks) {
      await container.tasks
        .close()
        .catch(warnOnCleanupError("ScheduledTasks (BullMQ) close"));
    }
    if (this._taskFireConsumer) {
      await this._taskFireConsumer
        .stopConsuming()
        .catch(warnOnCleanupError("TaskFireConsumer stop"));
      this._taskFireConsumer = null;
    }
    await super.destroy().catch(warnOnCleanupError("Sapphire client destroy"));
    await flushAllMessageDeletes().catch(
      warnOnCleanupError("flushAllMessageDeletes"),
    );
    await this._ownedEventBus
      ?.close()
      .catch(warnOnCleanupError("EventBus close"));
    this._ownedEventBus = null;
    await container.invalidation
      .close()
      .catch(warnOnCleanupError("Invalidation close"));
    await container.signals
      .close()
      .catch(warnOnCleanupError("Signals close"));
    await container.redis.quit().catch(warnOnCleanupError("Redis quit"));
    // $disconnect alone leaves the pg Pool open: the adapter is constructed from
    // a pool we own, so Prisma never ends it. Both pools drain here.
    await disconnectDatabase().catch(warnOnCleanupError("Database disconnect"));
  }

  public override fetchPrefix = async (message: Message) => {
    if (message.guild) {
      const settings = await container.db.config.getGuildSettings(
        message.guild.id,
      );
      if (settings.prefix) {
        return [settings.prefix];
      }
      const globalConfig = await container.db.global
        .getGlobalConfig()
        .catch(() => null);
      const envFallback = getDefaultPrefix();
      return [globalConfig?.defaultPrefix ?? envFallback];
    }

    const globalConfig = await container.db.global
      .getGlobalConfig()
      .catch(() => null);
    const envFallback = getDefaultPrefix();
    return globalConfig?.defaultPrefix ?? envFallback;
  };

  /**
   * Factory kept as the stable call site for the worker entrypoint. Shard
   * assignment (`SHARDS`/`SHARD_COUNT`) comes from discord.js's
   * `ShardingManager` via env vars read directly by the `Client` constructor
   * - see `apps/worker/src/main.ts`.
   *
   * @param options - Additional options for client construction.
   * @returns A fully constructed and initialized {@linkcode LumiClient}.
   */
  public static bootstrap(options: LumiClient.Options = {}): LumiClient {
    return new LumiClient(options);
  }
}

export namespace LumiClient {
   
  export interface Options {}
}
