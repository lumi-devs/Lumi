import { container } from "#src/lib/Services.js";
import { tryParseJSON } from "#src/shared/Index.ts";
import type {ValkeyClient} from "#src/lib/valkey/Cluster.js";
import { ValkeyKeys } from "#src/lib/valkey/Client.js";

const PublishIntervalMs = 10_000;
const TtlMs = PublishIntervalMs * 3;

export interface SchedulerHeartbeat {

  holder: string;

  updatedAt: number;
}

export interface SchedulerHeartbeatWatcher {
  close(): Promise<void>;
}

export function publishSchedulerHeartbeat(
  valkey: ValkeyClient,
  holder: string,
): SchedulerHeartbeatWatcher {
  const publish = async () => {
    try {
      await valkey.set(
        ValkeyKeys.schedulerHeartbeat(),
        JSON.stringify({ holder, updatedAt: Date.now() } satisfies SchedulerHeartbeat),
        "PX",
        TtlMs,
      );
    } catch (err: unknown) {
      container.logger.warn("[Scheduler] Heartbeat publish failed:", err);
    }
  };

  const timer = setInterval(() => void publish(), PublishIntervalMs);
  timer.unref?.();
  void publish();

  return {
    close: () => {
      clearInterval(timer);
      return Promise.resolve();
    },
  };
}

export async function readSchedulerHeartbeat(
  valkey: ValkeyClient,
): Promise<SchedulerHeartbeat | null> {
  const raw = await valkey.get(ValkeyKeys.schedulerHeartbeat());
  if (!raw) return null;
  const parsed = tryParseJSON(raw) as SchedulerHeartbeat | null;
  if (!parsed || typeof parsed.updatedAt !== "number" || typeof parsed.holder !== "string") {
    return null;
  }
  return parsed;
}
