import type { Container } from "#src/lib/Services.js";
import {
  DashboardEventSchema,
  DashboardEventStream,
  type DashboardEvent,
} from "#src/contracts/Events.js";
import { dashboardEventPublishFailures } from "#src/observability/Index.ts";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type DashboardEventInput = DistributiveOmit<DashboardEvent, "v">;

export async function publishDashboardEvent(services: Container, event: DashboardEventInput): Promise<void> {
  const stamped = { ...event, v: 1 };
  const validated = DashboardEventSchema.safeParse(stamped);
  if (!validated.success) {
    dashboardEventPublishFailures.inc({ reason: "invalid" });
    services.logger.warn("[DashboardEvents] dropping invalid event", {
      type: stamped.type,
      guildId: (stamped as { guildId?: unknown }).guildId,
      err: validated.error.message,
    });
    return;
  }

  const value = validated.data;
  try {
    await services.eventBus.publish(DashboardEventStream, value);
  } catch (err) {
    dashboardEventPublishFailures.inc({ reason: "publish_failed" });
    services.logger.warn("[DashboardEvents] publish failed", {
      type: value.type,
      guildId: value.guildId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
