import { container } from "@sapphire/framework";
import type { ScheduledTasks } from "#lib/types/common.js";
import { injectTraceContext } from "@lumi/observability";

export const taskFireStream = (name: string) => `lumi.scheduler.fire:${name}`;

export interface FireEnvelope<
  N extends keyof ScheduledTasks = keyof ScheduledTasks,
> {
  name: N;
  payload: ScheduledTasks[N];
  traceparent?: string;
  tracestate?: string;
}

/**
 * Called by each ScheduledTask piece's `run()` on whichever replica BullMQ
 * handed the job to. Workers consume the corresponding stream and run the
 * registered fire-handler.
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
