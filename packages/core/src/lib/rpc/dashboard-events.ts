import { container } from "@sapphire/framework";
import { DashboardEventStream, type DashboardEvent } from "@lumi/contracts/events";

/**
 * Best-effort publish for the dashboard SSE stream - never blocks or fails
 * the RPC mutation it's called from. `container.eventBus` is also absent in
 * most existing RPC unit tests (they don't stand up the event bus), so a
 * missing bus is treated the same as a publish error: log and move on.
 */
export async function publishDashboardEvent(event: DashboardEvent): Promise<void> {
  try {
    await container.eventBus?.publish(DashboardEventStream, event);
  } catch (err) {
    container.logger?.warn?.("[DashboardEvents] publish failed", {
      type: event.type,
      guildId: event.guildId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
