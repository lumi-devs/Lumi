import { s } from "@sapphire/shapeshift";
import type {
  PanicStateView,
  VerificationPanelSetResult,
  VerificationPanelView,
} from "../views";
import { rpcAction, RpcTimeouts } from "./define";
import { SnowflakeSchema } from "./schemas";

export interface GuildBackupView {
  id: number;
  createdAt: string;
  roleCount: number;
  channelCount: number;
}

/** Entering reports the lockdown counts; reverting reports what was restored. */
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
  }),
  "guild.panic.set": rpcAction<PanicSetResult>()({
    input: s.object({
      /** `false` reverts panic mode. */
      active: s.boolean(),
      /** Narrows which channels get locked. */
      channelIds: s.array(SnowflakeSchema).optional(),
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
  }),
  "guild.verificationPanel.set": rpcAction<VerificationPanelSetResult>()({
    input: s.object({
      /** Exactly one of `channelId` and `createChannel` must be given. */
      channelId: SnowflakeSchema.optional(),
      createChannel: s.boolean().optional(),
      /** Only matters when the target channel differs from the tracked one. */
      deleteOldMessage: s.boolean().optional(),
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
  }),
  "guild.backups.restore": rpcAction<{
    success: boolean;
    rolesRestored: number;
    channelsRestored: number;
  }>()({
    input: s.object({ backupId: s.number().int().optional() }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.bulk,
    summary: "Restore a guild backup.",
  }),
};
