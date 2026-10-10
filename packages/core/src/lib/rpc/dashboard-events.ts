import type { Container } from "@lumi/lib/services.js";
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
export async function publishDashboardEvent(services: Container, event: DashboardEventInput): Promise<void> {
  const stamped = { ...event, v: 1 };
  const validated = DashboardEventSchema.safeParse(stamped);
  if (!validated.success) {
    dashboardEventPublishFailures.inc({ reason: "invalid" });
    services.logger?.warn?.("[DashboardEvents] dropping invalid event", {
      type: stamped.type,
      guildId: (stamped as { guildId?: unknown }).guildId,
      err: validated.error.message,
    });
    return;
  }

  const value = validated.data;
  try {
    await services.eventBus?.publish(DashboardEventStream, value);
  } catch (err) {
    dashboardEventPublishFailures.inc({ reason: "publish_failed" });
    services.logger?.warn?.("[DashboardEvents] publish failed", {
      type: value.type,
      guildId: value.guildId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
