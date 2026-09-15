import { s } from "@sapphire/shapeshift";
import type { BlocklistListData, IgnoredChannelView } from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";
import {
  BlocklistAddSchema,
  BlocklistRemoveSchema,
  PaginationSchema,
  SnowflakeSchema,
} from "./schemas.js";

export const PermitKinds = ["enforced", "custom"] as const;
export type PermitKind = (typeof PermitKinds)[number];

export const PermitTargetTypes = ["role", "user"] as const;
export type PermitTargetType = (typeof PermitTargetTypes)[number];

// Read models carry the stored strings, which are wider than the write-side
// enums until the database constrains them.
export interface PermitAssignmentView {
  id: number;
  targetType: string;
  targetId: string;
}

export interface PermitView {
  id: number;
  name: string;
  kind: string;
  nodes: string[];
  builtin: boolean;
  assignments: PermitAssignmentView[];
}

const PermitNameSchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);

const PermitNodesSchema = s
  .array(s.string().lengthGreaterThanOrEqual(1))
  .lengthGreaterThanOrEqual(1);

const PermitTargetSchema = s.object({
  permitId: s.number().int(),
  targetType: s.enum(PermitTargetTypes),
  targetId: SnowflakeSchema,
});

const IgnoredChannelSchema = s.object({
  /** `null` targets the guild-wide ignore row rather than one channel. */
  channelId: SnowflakeSchema.nullable(),
});

export const coreRpc = {
  "guild.permits.list": rpcAction<{ permits: PermitView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List permits with assignments.",
  }),
  "guild.permits.create": rpcAction<{
    success: boolean;
    permit: { id: number };
  }>()({
    input: s.object({
      name: PermitNameSchema,
      kind: s.enum(PermitKinds),
      nodes: PermitNodesSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Create an enforced or custom permit.",
  }),
  "guild.permits.update": rpcAction<{
    success: boolean;
    permit: { id: number } | null;
  }>()({
    input: s.object({
      permitId: s.number().int(),
      name: PermitNameSchema.optional(),
      nodes: PermitNodesSchema.optional(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Rename or re-scope a permit.",
  }),
  "guild.permits.delete": rpcAction<{ success: boolean }>()({
    input: s.object({ permitId: s.number().int() }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Delete a permit.",
  }),
  "guild.permits.assign": rpcAction<{ success: boolean }>()({
    input: PermitTargetSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Grant a permit to a role or user.",
  }),
  "guild.permits.unassign": rpcAction<{ success: boolean }>()({
    input: PermitTargetSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Revoke a permit grant.",
  }),
  "guild.blocklist.list": rpcAction<BlocklistListData>()({
    input: PaginationSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Paged guild blocklist.",
  }),
  "guild.blocklist.add": rpcAction<{ success: boolean; userId: string }>()({
    input: BlocklistAddSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Block a user.",
  }),
  "guild.blocklist.remove": rpcAction<{ success: boolean; userId: string }>()({
    input: BlocklistRemoveSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Unblock a user.",
  }),
  "guild.ignored.list": rpcAction<{ entries: IgnoredChannelView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List ignored channels.",
  }),
  "guild.ignored.add": rpcAction<{
    success: boolean;
    channelId: string | null;
  }>()({
    input: IgnoredChannelSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Ignore a channel; null targets the guild-wide row.",
  }),
  "guild.ignored.remove": rpcAction<{
    success: boolean;
    channelId: string | null;
  }>()({
    input: IgnoredChannelSchema,
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Un-ignore a channel.",
  }),
};
