import { getClusterName, isPrimaryShard } from "@lib/Env.js";
import { registerReadinessProbe } from "@observability/Index.ts";
import { container } from "@lib/Services.js";
import { DefaultClusterName, readClusterShards } from "@lib/sharding/ShardTelemetry.js";

export function registerInfrastructureReadinessProbes(): void {

  registerReadinessProbe("postgres", async () => {
    try {
      await container.db.probePrisma();
      return { status: "ok" };
    } catch (err) {
      container.logger?.error("[Readiness] postgres probe failed:", err);
      return { status: "fail", detail: "database unreachable" };
    }
  });

  registerReadinessProbe("redis", async () => {
    try {
      const pong = await container.redis.ping();
      if (pong === "PONG") return { status: "ok" };
      container.logger?.error(
        `[Readiness] redis probe returned unexpected reply: ${pong}`,
      );
      return { status: "fail", detail: "redis unreachable" };
    } catch (err) {
      container.logger?.error("[Readiness] redis probe failed:", err);
      return { status: "fail", detail: "redis unreachable" };
    }
  });
}

export function registerRpcReadinessProbe(isRpcReady: () => boolean): void {
  registerReadinessProbe("rpc-server", () =>
    isRpcReady()
      ? { status: "ok" }
      : { status: "fail", detail: "rpc server not running" },
  );
}

export function registerWorkerProbes(client: { isReady: () => boolean }): void {
  registerInfrastructureReadinessProbes();
  registerReadinessProbe("discord", async () => {
    if (!client.isReady()) {
      return { status: "fail", detail: "client not ready" };
    }

    if (!isPrimaryShard()) return { status: "ok" };
    try {
      const snapshot = await readClusterShards({
        redis: container.redis,
        clusterName: getClusterName() ?? DefaultClusterName,
      });
      if (snapshot.shards.length === 0) {
        return { status: "fail", detail: "no shard telemetry observed" };
      }
      if (snapshot.missingShardIds.length > 0) {
        return {
          status: "fail",
          detail: `missing shards: ${snapshot.missingShardIds.join(",")}`,
        };
      }
      const notReady = snapshot.shards
        .filter((s) => s.status !== "Ready")
        .map((s) => s.shardId);
      if (notReady.length > 0) {
        return {
          status: "fail",
          detail: `shards not ready: ${notReady.join(",")}`,
        };
      }
      return { status: "ok" };
    } catch (err) {
      container.logger?.error("[Readiness] cluster shard check failed:", err);
      return { status: "fail", detail: "cluster shard telemetry unreachable" };
    }
  });
}
