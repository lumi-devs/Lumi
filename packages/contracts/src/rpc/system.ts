import { s } from "@sapphire/shapeshift";
import type {
  AuditListData,
  BlocklistListData,
  FeatureFlagOverrideView,
  FeatureFlagView,
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
    input: s.object({
      maintenanceMode: s.boolean(),
      maintenanceMessage: s.string().optional(),
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
    input: s.object({
      moduleName: s.string().lengthGreaterThanOrEqual(1),
      enabled: s.boolean(),
      reason: s.string().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Globally toggle a module.",
  }),
  "system.module.clear": rpcAction<{ success: boolean; moduleName: string }>()({
    input: s.object({ moduleName: s.string().lengthGreaterThanOrEqual(1) }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Clear a module's global state.",
  }),
  "system.identity.set": rpcAction<{
    success: boolean;
    inviteUrl: string | null;
    supportGuildId: string | null;
  }>()({
    input: s.object({
      inviteUrl: s
        .string()
        .url({ allowedProtocols: ["http:", "https:"] })
        .nullable()
        .optional(),
      supportGuildId: SnowflakeSchema.nullable().optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Set invite URL and support guild.",
  }),
  "system.audit.list": rpcAction<AuditListData>()({
    input: s.object({ guildId: SnowflakeSchema.optional(), ...AuditFilterShape }),
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
    input: s.object({
      key: FeatureFlagKeySchema,
      description: s.string().lengthLessThanOrEqual(500).nullable().optional(),
      enabled: s.boolean(),
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
    input: s.object({
      flagKey: FeatureFlagKeySchema,
      guildId: SnowflakeSchema,
      enabled: s.boolean(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Force a feature flag on/off for one guild.",
  }),
  "system.flags.override.delete": rpcAction<{ success: boolean }>()({
    input: s.object({
      flagKey: FeatureFlagKeySchema,
      guildId: SnowflakeSchema,
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Remove a guild's override, returning it to the flag's rollout.",
  }),
};
