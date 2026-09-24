import { s } from "@sapphire/shapeshift";
import type {
  AuditListData,
  BlocklistListData,
  SystemDashboardData,
} from "../views";
import { rpcAction, RpcTimeouts } from "./define";
import {
  AuditFilterShape,
  BlocklistAddSchema,
  BlocklistRemoveSchema,
  PaginationSchema,
  SnowflakeSchema,
} from "./schemas";

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
  }),
  "system.blocklist.list": rpcAction<BlocklistListData>()({
    input: PaginationSchema,
    auth: "botOwner",
    timeoutMs: RpcTimeouts.short,
    summary: "Global blocklist.",
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
  }),
};
