import { buildRestOptions } from "#lib/discord-rest.js";
import {
  getScheduledTasksConnectionOptions,
  SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
} from "#lib/client/scheduled-tasks-queue.js";
import { envParseString, getConsumerId } from "#lib/env.js";
import { PinoSapphireLogger } from "#lib/logging/PinoSapphireLogger.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import type { RedisLock } from "#lib/lock.js";
import { acquireSchedulerLock } from "#lib/scheduler-lock.js";
import { watchFailedJobs } from "#lib/scheduler-failed-jobs.js";
import { watchQueueDepth } from "#lib/scheduler-queue-metrics.js";
import {
  publishSchedulerHeartbeat,
  type SchedulerHeartbeatWatcher,
} from "#lib/scheduler-heartbeat.js";
import { SapphireClient, container } from "@sapphire/framework";
import { installContainerServices } from "./container-services.js";

export interface SchedulerContainerServices {
  client: SapphireClient;
  ownedEventBus: OwnedEventBus;
  schedulerLock: RedisLock;
  failedJobsWatcher: { close(): Promise<void> };
  queueDepthWatcher: { close(): Promise<void> };
  heartbeatWatcher: SchedulerHeartbeatWatcher;
}

/**
 * Installs container services for the gateway-free scheduler process.
 * Initializes BullMQ tasks and loads scheduled-task stores without calling `client.login()`.
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
        connection: getScheduledTasksConnectionOptions(),
        defaultJobOptions: SCHEDULED_TASKS_DEFAULT_JOB_OPTIONS,
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
  const queueDepthWatcher = watchQueueDepth(container.tasks);
  const heartbeatWatcher = publishSchedulerHeartbeat(container.redis, getConsumerId());

  return {
    client,
    ownedEventBus,
    schedulerLock,
    failedJobsWatcher,
    queueDepthWatcher,
    heartbeatWatcher,
  };
}
