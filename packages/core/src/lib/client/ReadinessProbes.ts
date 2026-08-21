import { getClusterName, isPrimaryShard } from "#lib/env.js";
import { registerReadinessProbe } from "@lumi/observability";
import { container } from "@sapphire/framework";
import { DEFAULT_CLUSTER_NAME, readClusterShards } from "@lumi/sharding";

/**
 * Declares the `/readyz` probes a client replica answers with.
 *
 * @remarks
 *
 * {@linkcode register} runs once, at the tail of `login()`, so that every
 * dependency a probe reports on already exists. Every process holds a real
 * gateway shard now, so the `discord` probe always applies; `scheduler-tasks`
 * only applies to the primary shard, the sole process BullMQ is wired up on
 * (see `setup.ts`).
 *
 * Probes reach their dependency through the suppliers passed in rather than
 * capturing it, because the client releases those handles during shutdown and
 * a probe must observe that rather than a stale reference.
 */
export class ReadinessProbes {
  /** Whether the gateway connection is usable. */
  protected readonly isReady: () => boolean;

  public constructor(options: ReadinessProbes.Options) {
    this.isReady = options.isReady;
  }

  /** Declares every applicable probe. */
  public register(): void {
    this.registerInfrastructureProbes();
    this.registerDiscordProbe();
    this.registerSchedulerProbe();
  }

  /** Declares the probes shared by every process: the backing services. */
  protected registerInfrastructureProbes(): void {
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
          redis: container.redis,
          clusterName: getClusterName() ?? DEFAULT_CLUSTER_NAME,
        });
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

  protected registerSchedulerProbe(): void {
    if (!isPrimaryShard()) return;
    registerReadinessProbe("scheduler-tasks", () =>
      container.tasks
        ? { status: "ok" }
        : { status: "fail", detail: "tasks store missing" },
    );
  }
}

export namespace ReadinessProbes {
  export interface Options {
    /** Reads the client's current gateway readiness. */
    isReady: () => boolean;
  }
}
