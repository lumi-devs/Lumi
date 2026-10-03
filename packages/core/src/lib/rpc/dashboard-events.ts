import { container } from "@sapphire/framework";
import {
  DashboardEventSchema,
  DashboardEventStream,
  type DashboardEvent,
} from "@lumi/contracts/events";
import { dashboardEventPublishFailures } from "@lumi/observability";

/**
 * Producer-facing shape - callers never stamp the schema version themselves.
 * `Omit` alone would collapse the union to its shared keys, so this distributes
 * over each variant instead.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type DashboardEventInput = DistributiveOmit<DashboardEvent, "v">;

/**
 * Best-effort publish for the dashboard SSE stream - never blocks or fails
 * the RPC mutation it's called from. `container.eventBus` is also absent in
 * most existing RPC unit tests (they don't stand up the event bus), so a
 * missing bus is treated the same as a publish error: log and move on.
 */
export async function publishDashboardEvent(event: DashboardEventInput): Promise<void> {
  const stamped = { ...event, v: 1 };
  const validated = DashboardEventSchema.run(stamped);
  if (validated.isErr()) {
    dashboardEventPublishFailures.inc({ reason: "invalid" });
    container.logger?.warn?.("[DashboardEvents] dropping invalid event", {
      type: stamped.type,
      guildId: (stamped as { guildId?: unknown }).guildId,
      err: validated.error.message,
    });
    return;
  }

  const value = validated.unwrap();
  try {
    await container.eventBus?.publish(DashboardEventStream, value);
  } catch (err) {
    dashboardEventPublishFailures.inc({ reason: "publish_failed" });
    container.logger?.warn?.("[DashboardEvents] publish failed", {
      type: value.type,
      guildId: value.guildId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
