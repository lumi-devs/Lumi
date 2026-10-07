import { container } from "#lib/services.js";
import { tryParseJSON } from "@lumi/shared";
import type { ValkeyClient } from "@lumi/infrastructure/database";
import { ValkeyKeys } from "#lib/database/valkey.js";

/**
 * Separate from `lumi:scheduler:leader` (the mutex `scheduler-lock.ts`
 * acquires): that key's value is a fencing token with no reader-facing
 * meaning, and its TTL is a 30s mutual-exclusion lease, not a freshness
 * signal anything should probe. This key exists solely so a process with no
 * BullMQ worker of its own (`apps/api`) can tell "scheduler alive and
 * publishing recently" from "scheduler gone" without reaching into the
 * lock's internals.
 */
const PublishIntervalMs = 10_000;
const TtlMs = PublishIntervalMs * 3;

export interface SchedulerHeartbeat {
  /** `getConsumerId()` of the replica holding the scheduler lock. */
  holder: string;
  /** Wall-clock of this publish (ms). */
  updatedAt: number;
}

export interface SchedulerHeartbeatWatcher {
  close(): Promise<void>;
}

/** Publishes a TTL'd heartbeat row on an interval, for as long as the scheduler lock is held. */
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

/** Reads the current heartbeat row, or `null` if the scheduler has never published or its row expired. */
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
