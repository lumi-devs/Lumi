import { getClusterName, isPrimaryShard } from "#lib/env.js";
import { registerReadinessProbe } from "@lumi/observability";
import { container } from "@sapphire/framework";
import { DefaultClusterName, readClusterShards } from "#lib/sharding/shard-telemetry.js";

/**
 * Declares the `/readyz` probes a client replica answers with.
 *
 * @remarks
 * Registers `/readyz` probes for gateway, infrastructure, and process-specific subsystems.
 */
/** Declares postgres and valkey readiness probes for processes with backing service connections. */
export function registerInfrastructureReadinessProbes(): void {
  // `/readyz` is reachable by anyone who can reach the metrics port, so probe
  // details are fixed classifications. Driver errors are logged instead:
  // stringified connection failures embed host, port, database and sometimes
  // the credentials from the connection string.
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

/**
 * Declares the `rpc-server` probe for a process that owns an RPC HTTP
 * server. Pulled out of {@linkcode ReadinessProbes} for the same reason as
 * {@linkcode registerInfrastructureReadinessProbes} - `apps/api` needs it
 * without the gateway/scheduler probes the class also declares.
 */
export function registerRpcReadinessProbe(isRpcReady: () => boolean): void {
  registerReadinessProbe("rpc-server", () =>
    isRpcReady()
      ? { status: "ok" }
      : { status: "fail", detail: "rpc server not running" },
  );
}

/**
 * Declares the `scheduler-tasks` probe for `apps/scheduler` - the sole
 * process that now holds the scheduler lock / BullMQ `Worker` (see the
 * scheduler extraction's Phase S1). Pulled out for the same reason as
 * {@linkcode registerRpcReadinessProbe}: a gateway-free process needs this
 * probe without the gateway/`ReadinessProbes` class it never instantiates.
 */
export function registerSchedulerReadinessProbe(hasLock: () => boolean): void {
  registerReadinessProbe("scheduler-tasks", () =>
    hasLock()
      ? { status: "ok" }
      : { status: "fail", detail: "scheduler lock not held" },
  );
}

export class ReadinessProbes {
  /** Whether the gateway connection is usable. */
  protected readonly isReady: () => boolean;
  protected readonly isRpcReady?: () => boolean;

  public constructor(options: ReadinessProbes.Options) {
    this.isReady = options.isReady;
    this.isRpcReady = options.isRpcReady;
  }

  /** Declares every applicable probe. */
  public register(): void {
    this.registerInfrastructureProbes();
    this.registerDiscordProbe();
    this.registerRpcProbe();
  }

  /** Declares the probes shared by every process: the backing services. */
  protected registerInfrastructureProbes(): void {
    registerInfrastructureReadinessProbes();
  }

  protected registerDiscordProbe(): void {
    registerReadinessProbe("discord", async () => {
      if (!this.isReady()) {
        return { status: "fail", detail: "client not ready" };
      }
      // Only the primary shard binds `/readyz`, so it also has to speak for
      // every sibling shard spawned by ShardingManager in this pod - a
      // single shard's own readiness says nothing about the others.
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

  protected registerRpcProbe(): void {
    // Registered only when a caller actually supplies `isRpcReady` - i.e.
    // only for a process that owns an RPC HTTP server to report on
    // (`apps/api` today; the worker stopped serving RPC in the API
    // extraction's Phase C and no longer passes this option at all).
    if (!this.isRpcReady) return;
    registerRpcReadinessProbe(this.isRpcReady);
  }
}

export namespace ReadinessProbes {
  export interface Options {
    isReady: () => boolean;
    isRpcReady?: () => boolean;
  }
}
