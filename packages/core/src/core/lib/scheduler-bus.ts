// Scheduler bus contracts.
//
// Workers do not run BullMQ. They publish `RequestEnvelope`s on
// `SCHEDULER_REQUEST_STREAM` and the scheduler app converts them into
// `container.tasks.create()` / `.delete()` calls against BullMQ.
//
// When a delayed/periodic job comes due, the scheduler's `ScheduledTask.run`
// publishes a `FireEnvelope` on `taskFireStream(name)`; workers register a
// fire-handler per task name and execute the actual side-effect (Discord
// writes, DB updates, …).

import { container } from "@sapphire/framework";
import type { ScheduledTasks } from "#core/types/common.js";

export const SCHEDULER_REQUEST_STREAM = "lumi.scheduler.request";

export const taskFireStream = (name: string) => `lumi.scheduler.fire:${name}`;

export interface CreateRequest<
  N extends keyof ScheduledTasks = keyof ScheduledTasks,
> {
  action: "create";
  name: N;
  payload: ScheduledTasks[N];
  /**
   * Forwarded verbatim to `container.tasks.create(task, options)`. Either a ms
   * delay (number) or the full options bag with `customJobOptions.jobId` for
   * idempotency / cancel-by-id.
   */
  options?:
    | number
    | {
        repeated?: boolean;
        delay?: number;
        interval?: number;
        pattern?: string;
        timezone?: string;
        customJobOptions?: {
          jobId?: string;
          removeOnComplete?: boolean | number;
          removeOnFail?: boolean | number;
        };
      };
}

export interface DeleteRequest {
  action: "delete";
  /** BullMQ jobId previously passed via `customJobOptions.jobId`. */
  jobId: string;
}

export type RequestEnvelope = CreateRequest | DeleteRequest;

export interface FireEnvelope<
  N extends keyof ScheduledTasks = keyof ScheduledTasks,
> {
  name: N;
  payload: ScheduledTasks[N];
}

/**
 * Publish a `create` request. Used by the role-aware `scheduleTask()` shim and
 * by ModModule.reconcileScheduledJobs(). Safe to call from any role: on
 * monolith the same process consumes it almost immediately.
 */
export async function publishCreateRequest<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: CreateRequest["options"],
): Promise<void> {
  const env: CreateRequest<N> = { action: "create", name, payload, options };
  await container.eventBus.publish(SCHEDULER_REQUEST_STREAM, env);
}

export async function publishDeleteRequest(jobId: string): Promise<void> {
  const env: DeleteRequest = { action: "delete", jobId };
  await container.eventBus.publish(SCHEDULER_REQUEST_STREAM, env);
}

/**
 * Called by each ScheduledTask piece's `run()` on the scheduler. Workers (or
 * the monolith) consume the corresponding stream and run the registered
 * fire-handler.
 */
export async function publishTaskFire<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
): Promise<void> {
  const env: FireEnvelope<N> = { name, payload };
  await container.eventBus.publish(taskFireStream(name), env);
}
