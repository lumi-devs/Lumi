import { buildRestOptions } from "#lib/discord-rest.js";
import { envParseString, getConsumerId } from "#lib/env.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import type { ValkeyLock } from "@lumi/infrastructure/cache";
import { acquireSchedulerLock } from "#lib/scheduler-lock.js";
import { ScheduledTaskRunner } from "#lib/scheduler-runner.js";
import { loadScheduledTasks } from "#lib/scheduled-tasks.js";
import { watchFailedJobs } from "#lib/scheduler-failed-jobs.js";
import { watchQueueDepth } from "#lib/scheduler-queue-metrics.js";
import {
  publishSchedulerHeartbeat, type SchedulerHeartbeatWatcher, } from "#lib/scheduler-heartbeat.js";
import { Client } from "discord.js";
import { container } from "#lib/services.js";
import { installContainerServices } from "./container-services.js";

export interface SchedulerContainerServices {
  client: Client;
  ownedEventBus: OwnedEventBus;
  schedulerLock: ValkeyLock;
  failedJobsWatcher: { close(): Promise<void> };
  queueDepthWatcher: { close(): Promise<void> };
  heartbeatWatcher: SchedulerHeartbeatWatcher;
}

export async function installSchedulerContainerServices(): Promise<SchedulerContainerServices> {
  const client = new Client({
    intents: [],
    rest: buildRestOptions(),
  });

  const ownedEventBus = installContainerServices(
    client,
    envParseString("SERVICE_NAME", "lumi-scheduler"),
  );

  await container.moduleStore.discover();
  for (const record of container.moduleStore.all()) {
    if (!record.enabled) continue;
    await container.moduleStore.loadModule(record.name).catch((err: unknown) => {
      container.logger.error(`[Scheduler] Module load failed: ${record.name}`, err);
    });
  }

  for (const record of container.moduleStore.loaded()) {
    if (record.state === "loaded") await loadScheduledTasks(record.dir);
  }

  const tasks = new ScheduledTaskRunner();
  container.tasks = tasks;

  const schedulerLock = await acquireSchedulerLock(container.valkey, () => {
    container.logger.error("[Scheduler] Lost scheduler lock, exiting");
    process.exit(1);
  }, container.logger);

  await tasks.createRepeated();

  const failedJobsWatcher = watchFailedJobs(tasks);
  const queueDepthWatcher = watchQueueDepth(tasks);
  const heartbeatWatcher = publishSchedulerHeartbeat(container.valkey, getConsumerId());

  return {
    client,
    ownedEventBus,
    schedulerLock,
    failedJobsWatcher,
    queueDepthWatcher,
    heartbeatWatcher,
  };
}
