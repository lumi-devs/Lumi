// Thin glue layer used by apps/gateway and LumiClient. Given a ShardPlan and Redis
// connections it returns a fully wired cluster topology: the shards this replica owns
// (from ClusterCoordinator.join()), the coordinator (for rebalance subscriptions +
// shutdown), the session store (passed into ws.{retrieve,update}SessionInfo), and an
// IDENTIFY throttler factory shared across replicas. It's the single source of "are we
// clustered?": with `clusterName` and Redis supplied, all three Redis-backed pieces are
// installed; otherwise it returns null and the caller stays on the single-process path
// (SHARD_LIST + SimpleIdentifyThrottler + no session persistence).

import type { Redis } from "ioredis";
import type { IIdentifyThrottler } from "@discordjs/ws";
import {
  ClusterCoordinator,
  type ClusterAssignment,
  type ShardDelta,
} from "./coordinator.js";
import { RedisSessionStore } from "./session-store.js";
import { buildRedisThrottlerFactory } from "./redis-throttler.js";
import type { ShardPlan } from "./shard-planner.js";

export interface ClusterBootstrapOptions {
  plan: ShardPlan;
  redis: Redis;
  subscriber: Redis;
  clusterName: string;
  replicaId: string;
  log?: (level: "info" | "warn" | "error", msg: string, meta?: object) => void;
  /** Forwarded to the coordinator. */
  heartbeatIntervalMs?: number;
  memberTtlMs?: number;
  /** Forwarded to the session store. */
  sessionTtlSeconds?: number;
  sessionFlushIntervalMs?: number;
  /**
   * Called when this replica's shard set changes after `join()`. The caller
   * is responsible for spawning/destroying shards on the WebSocketManager.
   * Note: a process that cannot reshard in-place may treat any non-empty
   * delta as a signal to drain + exit, relying on the orchestrator to bring
   * a new process up that will RESUME via the shared session store.
   */
  onRebalance?: (
    delta: ShardDelta,
    assignment: ClusterAssignment,
  ) => void | Promise<void>;
}

export interface ClusterBootstrap {
  /** Shard ids this replica should spawn at boot. */
  shards: number[];
  coordinator: ClusterCoordinator;
  sessionStore: RedisSessionStore;
  throttlerFactory: () => Promise<IIdentifyThrottler>;
  close: () => Promise<void>;
}

export async function attachCluster(
  opts: ClusterBootstrapOptions,
): Promise<ClusterBootstrap> {
  const coordinator = new ClusterCoordinator({
    redis: opts.redis,
    subscriber: opts.subscriber,
    clusterName: opts.clusterName,
    replicaId: opts.replicaId,
    shardCount: opts.plan.shardCount,
    heartbeatIntervalMs: opts.heartbeatIntervalMs,
    memberTtlMs: opts.memberTtlMs,
    log: opts.log,
  });
  if (opts.onRebalance) coordinator.onRebalance(opts.onRebalance);

  const { shards } = await coordinator.join();
  const sessionStore = new RedisSessionStore({
    redis: opts.redis,
    clusterName: opts.clusterName,
    ttlSeconds: opts.sessionTtlSeconds,
    flushIntervalMs: opts.sessionFlushIntervalMs,
    log: opts.log,
  });
  const throttlerFactory = buildRedisThrottlerFactory({
    redis: opts.redis,
    clusterName: opts.clusterName,
    maxConcurrency: opts.plan.maxConcurrency,
    log: opts.log,
  });

  return {
    shards,
    coordinator,
    sessionStore,
    throttlerFactory,
    close: async () => {
      await coordinator.leave();
      await sessionStore.close();
    },
  };
}
