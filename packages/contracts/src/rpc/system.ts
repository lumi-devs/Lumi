import { z } from "zod";
import type {
  AuditListData,
  BlocklistListData,
  SystemDashboardData,
} from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";
import {
  AuditFilterShape,
  BlocklistAddSchema,
  BlocklistRemoveSchema,
  FeatureFlagKeySchema,
  PaginationSchema,
  RolloutPercentSchema,
  SnowflakeSchema,
} from "./schemas.js";

import type { FeatureFlagView, FeatureFlagOverrideView } from "../views.js";
/** One reporting shard, as published by the process holding its WebSocket. */
export interface ShardStateView {
  shardId: number;
  replicaId: string;
  /** discord.js `Status` name, e.g. `Ready`, `Connecting`, `Reconnecting`. */
  status: string;
  /** Gateway heartbeat round-trip in ms; null until the first heartbeat lands. */
  ping: number | null;
  guildCount: number;
  lastHeartbeatAt: string;
  /** p99 event-loop delay of the reporting process, in ms; null until the first window closes. */
  eventLoopLagP99Ms?: number | null;
  /** Resident set size of the reporting process, in MB. */
  memoryRssMb?: number;
  /** Used heap of the reporting process, in MB. */
  heapUsedMb?: number;
  /** How long the reporting process has been alive, in seconds. */
  uptimeSec?: number;
  /** PID of the reporting process. */
  pid?: number;
  /** This shard's last Ready/Resume timestamp; null if it hasn't happened yet. */
  lastReadyAt?: string | null;
  /** True once `lastHeartbeatAt` is older than the fleet's staleness threshold. */
  stale?: boolean;
  /** Recent in-memory/Valkey buffered log entries for this shard. */
  logs?: Array<{ timestamp: string; level: string; message: string }>;
}

/** One gateway process in the cluster. */
export interface ClusterReplicaView {
  replicaId: string;
  reportingShardIds: number[];
}

export interface SystemShardsData {
  clusterName: string;
  shardCount: number;
  observedAt: string;
  replicas: ClusterReplicaView[];
  shards: ShardStateView[];
  /** Expected shard ids no process is reporting. */
  missingShardIds: number[];
}

/** `ok`/`degraded`/`down`, worst-status-wins at every aggregation level. */
export type SystemComponentStatus = "ok" | "degraded" | "down";

export interface SystemComponentHealth {
  status: SystemComponentStatus;
  /** Present when `status` is not `ok`. */
  reason?: string;
}

export interface SystemQueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface SystemSchedulerHealth extends SystemComponentHealth {
  /** `getConsumerId()` of the replica currently holding the scheduler lock; null if none has ever published. */
  lockHolder: string | null;
  /** Age of the last scheduler heartbeat, in ms; null if none has ever been observed. */
  heartbeatAgeMs: number | null;
  /** Shared scheduled-tasks BullMQ queue depth, by state; null if the probe failed. */
  queue: SystemQueueCounts | null;
}

export interface SystemShardsHealth extends SystemComponentHealth {
  /** Expected shard count the cluster believes it spans. */
  total: number;
  /** Shards reporting `Ready` and not stale. */
  up: number;
  /** Shards reporting but stale. */
  stale: number;
  /** Worst (highest) event-loop p99 lag across reporting shards, in ms; null if none reported one yet. */
  worstLagMs: number | null;
}

export interface SystemEventBusHealth extends SystemComponentHealth {
  /** Delivered-but-unacked entries on a consumer group this process actively consumes; null if not available here. */
  pending: number | null;
  /** Reserved for a future time-based lag metric; null today. */
  lag: number | null;
}

export interface SystemApiHealth extends SystemComponentHealth {
  uptimeSec: number;
  eventLoopLagP99Ms: number | null;
}

export interface SystemLatencyHealth extends SystemComponentHealth {
  latencyMs: number | null;
}

export interface SystemStatusData {
  observedAt: string;
  status: SystemComponentStatus;
  components: {
    api: SystemApiHealth;
    postgres: SystemLatencyHealth;
    valkey: SystemLatencyHealth;
    scheduler: SystemSchedulerHealth;
    shards: SystemShardsHealth;
    eventBus: SystemEventBusHealth;
  };
}

export const systemRpc = {
  "system.dashboard.get": rpcAction<SystemDashboardData>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "System-panel overview.",
    readOnly: true,
  }),
  "system.maintenance.set": rpcAction<{
    success: boolean;
    maintenanceMode: boolean;
  }>()({
    input: z.object({
      maintenanceMode: z.boolean(),
      maintenanceMessage: z.string().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Toggle maintenance mode.",
  }),
  "system.module.toggle": rpcAction<{
    success: boolean;
    moduleName: string;
    enabled: boolean;
  }>()({
    input: z.object({
      moduleName: z.string().min(1),
      enabled: z.boolean(),
      reason: z.string().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Globally toggle a module.",
  }),
  "system.module.clear": rpcAction<{ success: boolean; moduleName: string }>()({
    input: z.object({ moduleName: z.string().min(1) }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Clear a module's global state.",
  }),
  "system.identity.set": rpcAction<{
    success: boolean;
    inviteUrl: string | null;
    supportGuildId: string | null;
  }>()({
    input: z.object({
      inviteUrl: z.url({ protocol: /^https?$/ }).nullable().optional(),
      supportGuildId: SnowflakeSchema.nullable().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Set invite URL and support guild.",
  }),
  "system.audit.list": rpcAction<AuditListData>()({
    input: z.object({ guildId: SnowflakeSchema.optional(), ...AuditFilterShape }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.medium,
    summary: "Cross-guild audit log.",
    readOnly: true,
  }),
  "system.blocklist.list": rpcAction<BlocklistListData>()({
    input: PaginationSchema,
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "Global blocklist.",
    readOnly: true,
  }),
  "system.blocklist.add": rpcAction<{ success: boolean; userId: string }>()({
    input: BlocklistAddSchema,
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Add to the global blocklist.",
  }),
  "system.blocklist.remove": rpcAction<{ success: boolean; userId: string }>()({
    input: BlocklistRemoveSchema,
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Remove from the global blocklist.",
  }),
  "system.shards.get": rpcAction<SystemShardsData>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "Shard telemetry: replicas, shard states, missing ids.",
    readOnly: true,
  }),
  "system.flags.list": rpcAction<{ flags: FeatureFlagView[] }>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "List all feature flags.",
    readOnly: true,
  }),
  "system.flags.set": rpcAction<{ success: boolean; flag: FeatureFlagView }>()({
    input: z.object({
      key: FeatureFlagKeySchema,
      description: z.string().max(500).nullable().optional(),
      enabled: z.boolean(),
      rolloutPercent: RolloutPercentSchema,
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Create or update a feature flag.",
  }),
  "system.flags.override.set": rpcAction<{
    success: boolean;
    override: FeatureFlagOverrideView;
  }>()({
    input: z.object({
      flagKey: FeatureFlagKeySchema,
      guildId: SnowflakeSchema,
      enabled: z.boolean(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Force a feature flag on/off for one guild.",
  }),
  "system.flags.override.delete": rpcAction<{ success: boolean }>()({
    input: z.object({
      flagKey: FeatureFlagKeySchema,
      guildId: SnowflakeSchema,
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Remove a guild's override, returning it to the flag's rollout.",
  }),
  "system.status.get": rpcAction<SystemStatusData>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "Fleet-wide status page snapshot: api, postgres, valkey, scheduler, shards, event bus.",
    readOnly: true,
  }),
};
