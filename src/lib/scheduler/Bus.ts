import { container } from "#src/lib/Services.js";
import type { ScheduledTasks } from "#src/lib/types/Common.js";
import { injectTraceContext } from "#src/observability/Index.ts";

export const taskFireStream = (name: string) => `lumi.scheduler.fire:${name}`;

export interface FireEnvelope<
  N extends keyof ScheduledTasks = keyof ScheduledTasks,
> {
  name: N;
  payload: ScheduledTasks[N];
  traceparent?: string;
  tracestate?: string;
}

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
