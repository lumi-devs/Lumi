import { getClusterName, isPrimaryShard } from "#src/lib/Env.js";
import { registerReadinessProbe } from "#src/observability/Index.ts";
import { container } from "#src/lib/Services.js";
import { DefaultClusterName, readClusterShards } from "#src/lib/sharding/ShardTelemetry.js";

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

  registerReadinessProbe("valkey", async () => {
    try {
      const pong = await container.valkey.ping();
      if (pong === "PONG") return { status: "ok" };
      container.logger?.error(
        `[Readiness] valkey probe returned unexpected reply: ${pong}`,
      );
      return { status: "fail", detail: "valkey unreachable" };
    } catch (err) {
      container.logger?.error("[Readiness] valkey probe failed:", err);
      return { status: "fail", detail: "valkey unreachable" };
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

export function registerSchedulerReadinessProbe(hasLock: () => boolean): void {
  registerReadinessProbe("scheduler-tasks", () =>
    hasLock()
      ? { status: "ok" }
      : { status: "fail", detail: "scheduler lock not held" },
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
        valkey: container.valkey,
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
