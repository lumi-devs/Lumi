import { Redis, Cluster } from "ioredis";
import { redisConnectionOptions } from "#lib/database/redis.js";
import type { RedisClient as RedisConnection } from "#lib/database/cluster-safe.js";
import { getRedisClusterNodes, getRedisClusterScaleReads } from "#lib/env.js";
import { runCheck } from "#lib/doctor/util.js";
import type { DoctorCheckResult } from "#lib/doctor/types.js";

export const RedisCheckName = "redis";

/**
 * No minimum Redis version is documented anywhere in this codebase (no
 * `agents/` doc, no comment near `#lib/database/redis.js` pins one) - the
 * version is reported for visibility only, never used to warn/fail.
 */

export interface RedisProbeClient {
  ping: () => Promise<string>;
  info: (section?: string) => Promise<string>;
  quit: () => Promise<unknown>;
}

export interface RedisCheckDeps {
  /**
   * Override for tests. Real implementation opens a short-lived connection
   * using the same `redisConnectionOptions()`/cluster-detection helpers the
   * long-lived client uses, closed again after the probe.
   */
  getClient?: () => RedisProbeClient;
}

function defaultGetClient(): RedisProbeClient {
  const nodes = getRedisClusterNodes();
  const client: RedisConnection = nodes
    ? new Cluster(nodes, {
        lazyConnect: true,
        scaleReads: getRedisClusterScaleReads(),
        redisOptions: { ...redisConnectionOptions(), maxRetriesPerRequest: 1 },
      })
    : new Redis({
        ...redisConnectionOptions(),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  client.on("error", () => undefined);
  return {
    ping: () => client.ping(),
    info: (section) => (section ? client.info(section) : client.info()),
    quit: () => client.quit(),
  };
}

function parseInfoField(raw: string, field: string): string | null {
  const match = raw.match(new RegExp(`^${field}:(.+)$`, "m"));
  return match ? match[1]!.trim() : null;
}

export async function checkRedis(
  deps: RedisCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(RedisCheckName, timeoutMs, async () => {
    const client = (deps.getClient ?? defaultGetClient)();
    try {
      await client.ping();
    } catch (err) {
      return {
        name: RedisCheckName,
        status: "fail",
        detail: `PING failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check REDIS_HOST/REDIS_PORT (or REDIS_SENTINELS) and that Redis is reachable.",
      };
    }

    let version = "unknown";
    try {
      const info = await client.info("server");
      version = parseInfoField(info, "redis_version") ?? "unknown";
    } catch {
      // PING already succeeded - INFO failing (e.g. a restricted ACL) is
      // worth surfacing but shouldn't turn a reachable Redis into a failure.
      return {
        name: RedisCheckName,
        status: "warn",
        detail: "PING succeeded, but INFO failed - version could not be determined.",
      };
    } finally {
      await client.quit().catch(() => undefined);
    }

    return {
      name: RedisCheckName,
      status: "ok",
      detail: `Connected to Redis ${version}.`,
    };
  });
}
