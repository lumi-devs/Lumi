import { buildRestOptions } from "#lib/discord-rest.js";
import { parseRedisConnectionOption } from "#lib/database/redis.js";
import { envParseInteger, envParseString } from "#lib/env.js";
import { PinoSapphireLogger } from "#lib/logging/PinoSapphireLogger.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import type { RedisLock } from "#lib/lock.js";
import { acquireSchedulerLock } from "#lib/scheduler-lock.js";
import { watchFailedJobs } from "#lib/scheduler-failed-jobs.js";
import { SapphireClient, container } from "@sapphire/framework";
import { installContainerServices } from "./container-services.js";

export interface SchedulerContainerServices {
  client: SapphireClient;
  ownedEventBus: OwnedEventBus;
  schedulerLock: RedisLock;
  failedJobsWatcher: { close(): Promise<void> };
}

/**
 * The `installContainerServices()` counterpart for the gateway-free process
 * that owns BullMQ scheduling exclusively.
 *
 * @remarks
 *
 * Builds a real `SapphireClient` carrying `@sapphire/plugin-scheduled-tasks`
 * (imported by `setup-scheduler.ts`) and never calls `login()`, the same
 * trick `api-container-services.ts` uses for RPC - `preGenericsInitialization`
 * and `postInitialization` (which is what actually constructs the BullMQ
 * `Queue`/`Worker` and registers the `ScheduledTaskStore`) both run inside the
 * `SapphireClient` constructor itself, independent of `login()` (confirmed by
 * reading `SapphireClient`'s own source - only `postLogin`, piece-loading and
 * the websocket connect are gated behind `login()`). Piece-loading is
 * replicated by hand below since it's the other half of what `login()` would
 * have done, and it's what makes `container.stores.get("scheduled-tasks")`
 * contain the actual `RelayTask` pieces the `Worker` dispatches to by name.
 *
 * `postLogin`'s repeatable-task registration (`container.tasks.createRepeated()`)
 * is likewise never triggered by a hook here, since `login()` never runs - it's
 * called explicitly after the scheduler lock is confirmed, so only the single
 * lock-holding replica ever re-registers the fleet's repeatable jobs.
 */
export async function installSchedulerContainerServices(): Promise<SchedulerContainerServices> {
  const client = new SapphireClient({
    intents: [],
    rest: buildRestOptions(),
    baseUserDirectory: null,
    loadDefaultErrorListeners: false,
    loadApplicationCommandRegistriesStatusListeners: false,
    loadMessageCommandListeners: false,
    loadScheduledTaskErrorListeners: false,
    logger: {
      instance: new PinoSapphireLogger(
        envParseString("SERVICE_NAME", "lumi-scheduler"),
      ),
    },
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
  });

  const ownedEventBus = installContainerServices(client);

  await Promise.all(
    [...client.stores.values()].map((store) => store.loadAll()),
  );

  // Acquired after piece-loading (so the store is populated the moment the
  // `Worker` - already running since construction - could plausibly dispatch
  // a job to it) but before this replica trusts itself to own repeatable-job
  // registration. A second replica racing this fails fast (`onLostLock`/the
  // rejected promise below both `process.exit(1)`), same semantics
  // `LumiClient.ts` had.
  const schedulerLock = await acquireSchedulerLock(container.redis, () => {
    container.logger.error("[Scheduler] Lost scheduler lock, exiting");
    process.exit(1);
  });

  await container.tasks.createRepeated();

  const failedJobsWatcher = watchFailedJobs(container.tasks);

  return { client, ownedEventBus, schedulerLock, failedJobsWatcher };
}
