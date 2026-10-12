import { z } from "zod";
import type { BlocklistListData, IgnoredChannelView } from "#src/contracts/Views.js";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";
import {
  BlocklistAddSchema,
  BlocklistRemoveSchema,
  boundedArray,
  PaginationSchema,
  SnowflakeSchema,
} from "#src/contracts/rpc/Schemas.js";

export const PermitKinds = ["enforced", "custom"] as const;
export type PermitKind = (typeof PermitKinds)[number];

export const PermitTargetTypes = ["role", "user"] as const;
export type PermitTargetType = (typeof PermitTargetTypes)[number];

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

const PermitNameSchema = z
  .string()
  .min(1)
  .max(64);

const PermitNodesSchema = boundedArray(z.string().min(1), {
  min: 1,
});

const PermitTargetSchema = z.object({
  permitId: z.number().int(),
  targetType: z.enum(PermitTargetTypes),
  targetId: SnowflakeSchema,
});

const IgnoredChannelSchema = z.object({

  channelId: SnowflakeSchema.nullable(),
});

export const coreRpc = {
  "guild.permits.list": rpcAction<{ permits: PermitView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List permits with assignments.",
    readOnly: true,
  }),
  "guild.permits.create": rpcAction<{
    success: boolean;
    permit: { id: number };
  }>()({
    input: z.object({
      name: PermitNameSchema,
      kind: z.enum(PermitKinds),
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
    input: z.object({
      permitId: z.number().int(),
      name: PermitNameSchema.optional(),
      nodes: PermitNodesSchema.optional(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Rename or re-scope a permit.",
  }),
  "guild.permits.delete": rpcAction<{ success: boolean }>()({
    input: z.object({ permitId: z.number().int() }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Delete a permit.",
  }),
  "guild.permits.move": rpcAction<{ success: boolean }>()({
    input: z.object({
      permitId: z.number().int(),
      direction: z.enum(["up", "down"]),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Move a permit up or down in display order.",
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
    readOnly: true,
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
    readOnly: true,
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
