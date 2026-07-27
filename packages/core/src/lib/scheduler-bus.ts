import { container } from "@sapphire/framework";
import type { ScheduledTasks } from "#lib/types/common.js";
import { injectTraceContext } from "@lumi/observability";

export const SCHEDULER_REQUEST_STREAM = "lumi.scheduler.request";

export const taskFireStream = (name: string) => `lumi.scheduler.fire:${name}`;

export interface CreateRequest<
  N extends keyof ScheduledTasks = keyof ScheduledTasks,
> {
  action: "create";
  name: N;
  payload: ScheduledTasks[N];
  traceparent?: string;
  tracestate?: string;
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
  traceparent?: string;
  tracestate?: string;
}

export type RequestEnvelope = CreateRequest | DeleteRequest;

export interface FireEnvelope<
  N extends keyof ScheduledTasks = keyof ScheduledTasks,
> {
  name: N;
  payload: ScheduledTasks[N];
  traceparent?: string;
  tracestate?: string;
}

/**
 * Publish a `create` request. Used by the role-aware `scheduleTask()` shim and
 * by ModModule.reconcileScheduledJobs(). Safe to call from any role: in
 * worker mode the same process consumes it almost immediately.
 */
export async function publishCreateRequest<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
  options?: CreateRequest["options"],
): Promise<void> {
  const trace = injectTraceContext();
  const env: CreateRequest<N> = {
    action: "create",
    name,
    payload,
    options,
    traceparent: trace["traceparent"],
    tracestate: trace["tracestate"],
  };
  await container.eventBus.publish(SCHEDULER_REQUEST_STREAM, env);
}

export async function publishDeleteRequest(jobId: string): Promise<void> {
  const trace = injectTraceContext();
  const env: DeleteRequest = {
    action: "delete",
    jobId,
    traceparent: trace["traceparent"],
    tracestate: trace["tracestate"],
  };
  await container.eventBus.publish(SCHEDULER_REQUEST_STREAM, env);
}

/**
 * Called by each ScheduledTask piece's `run()` on the scheduler. Consumers (or
 * the worker) consume the corresponding stream and run the registered
 * fire-handler.
 */
export async function publishTaskFire<N extends keyof ScheduledTasks>(
  name: N,
  payload: ScheduledTasks[N],
): Promise<void> {
  const trace = injectTraceContext();
  const env: FireEnvelope<N> = {
    name,
    payload,
    traceparent: trace["traceparent"],
    tracestate: trace["tracestate"],
  };
  await container.eventBus.publish(taskFireStream(name), env);
}
