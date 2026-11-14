import { container } from "@lib/Services.js";
import { tryParseJSON } from "@shared/Index.ts";
import type {RedisClient} from "@redis/Cluster.js";
import { RedisKeys } from "@redis/Store.js";

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
  redis: RedisClient,
  holder: string,
): SchedulerHeartbeatWatcher {
  const publish = async () => {
    try {
      await redis.set(
        RedisKeys.schedulerHeartbeat(),
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
  redis: RedisClient,
): Promise<SchedulerHeartbeat | null> {
  const raw = await redis.get(RedisKeys.schedulerHeartbeat());
  if (!raw) return null;
  const parsed = tryParseJSON(raw) as SchedulerHeartbeat | null;
  if (!parsed || typeof parsed.updatedAt !== "number" || typeof parsed.holder !== "string") {
    return null;
  }
  return parsed;
}
