import { z } from "zod";
import type {
  PanicStateView,
  VerificationPanelSetResult,
  VerificationPanelView,
} from "#src/contracts/Views.js";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";
import { SnowflakeSchema } from "#src/contracts/rpc/Schemas.js";

export interface GuildBackupView {
  id: number;
  createdAt: string;
  roleCount: number;
  channelCount: number;
}

export interface PanicSetResult {
  success: boolean;
  active: boolean;
  invitesPaused?: boolean;
  lockedCount?: number;
  skippedCount?: number;
  restoredCount?: number;
  restoredStructure?: { rolesRestored: number; channelsRestored: number } | null;
}

export const securityRpc = {
  "guild.panic.get": rpcAction<PanicStateView>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Read panic-mode state.",
    readOnly: true,
  }),
  "guild.panic.set": rpcAction<PanicSetResult>()({
    input: z.object({

      active: z.boolean(),

      channelIds: z.array(SnowflakeSchema).optional(),
    }),
    auth: "guildManager",
    requiresEnabled: "security",
    timeoutMs: RpcTimeouts.bulk,
    summary: "Lock down the guild, optionally narrowed to channels.",
  }),
  "guild.verificationPanel.get": rpcAction<{
    panel: VerificationPanelView | null;
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Read the verification panel binding.",
    readOnly: true,
  }),
  "guild.verificationPanel.set": rpcAction<VerificationPanelSetResult>()({
    input: z.object({

      channelId: SnowflakeSchema.optional(),
      createChannel: z.boolean().optional(),

      deleteOldMessage: z.boolean().optional(),
    }),
    auth: "guildManager",
    requiresEnabled: "security",
    timeoutMs: RpcTimeouts.long,
    summary: "Bind the verification panel.",
  }),
  "guild.verificationPanel.delete": rpcAction<{
    success: boolean;
    deleted: boolean;
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Remove the verification panel.",
  }),
  "guild.verificationWeb.complete": rpcAction<{ success: boolean }>()({
    auth: "session",
    requiresEnabled: "security",
    timeoutMs: RpcTimeouts.long,
    summary: "Complete a web verification flow.",
  }),
  "guild.backups.list": rpcAction<{ backups: GuildBackupView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List guild backups (role/channel counts).",
    readOnly: true,
  }),
  "guild.backups.restore": rpcAction<{
    success: boolean;
    rolesRestored: number;
    channelsRestored: number;
  }>()({
    input: z.object({ backupId: z.number().int().optional() }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.bulk,
    summary: "Restore a guild backup.",
  }),
};
