import { z } from "zod";
import type {
  AuditListData,
  BlocklistListData,
  SystemDashboardData,
} from "#src/contracts/Views.js";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";
import {
  AuditFilterShape,
  BlocklistAddSchema,
  BlocklistRemoveSchema,
  FeatureFlagKeySchema,
  PaginationSchema,
  RolloutPercentSchema,
  SnowflakeSchema,
} from "#src/contracts/rpc/Schemas.js";

import type { FeatureFlagView, FeatureFlagOverrideView } from "#src/contracts/Views.js";

export interface ShardStateView {
  shardId: number;
  replicaId: string;

  status: string;

  ping: number | null;
  guildCount: number;
  lastHeartbeatAt: string;

  eventLoopLagP99Ms?: number | null;

  memoryRssMb?: number;

  heapUsedMb?: number;

  uptimeSec?: number;

  pid?: number;

  lastReadyAt?: string | null;

  stale?: boolean;

  logs?: Array<{ timestamp: string; level: string; message: string }>;
}

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

  missingShardIds: number[];
}

export type SystemComponentStatus = "ok" | "degraded" | "down";

export interface SystemComponentHealth {
  status: SystemComponentStatus;

  reason?: string;
}

export interface SystemQueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface SystemSchedulerHealth extends SystemComponentHealth {

  lockHolder: string | null;

  heartbeatAgeMs: number | null;

  queue: SystemQueueCounts | null;
}

export interface SystemShardsHealth extends SystemComponentHealth {

  total: number;

  up: number;

  stale: number;

  worstLagMs: number | null;
}

export interface SystemEventBusHealth extends SystemComponentHealth {

  pending: number | null;

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
  "system.tokens.list": rpcAction<{ tokens: Array<{ service: string; updatedAt: string }> }>()({
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "List shared API token services (values never leave the bot).",
    readOnly: true,
  }),
  "system.tokens.set": rpcAction<{ success: boolean }>()({
    input: z.object({
      service: z.string().min(1).max(64),
      token: z.string().min(1).max(2000),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Create or replace a shared API token.",
  }),
  "system.tokens.delete": rpcAction<{ success: boolean }>()({
    input: z.object({ service: z.string().min(1).max(64) }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Delete a shared API token.",
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
