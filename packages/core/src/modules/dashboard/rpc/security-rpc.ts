import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RpcActions } from "@lumi/contracts";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { GuildBackupData } from "#lib/backup/backup-types.js";
import { restoreGuildFromBackup } from "#lib/backup/restore-guild.js";
import {
  BackupRestoreSchema,
  PanicSetSchema,
  SnowflakeSchema,
  VerificationPanelSetSchema,
  cachedGuild,
  parsePayload,
  requireGuildId,
  requireGuildManager,
  verifyGuildAccess,
} from "../lib/helpers.js";

export function registerSecurityRpcHandlers(): void {
  registerRpcHandler(RpcActions.guildPanicGet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const state = await container.db.security.getPanicState(guildId);

    if (!state) {
      return {
        active: false,
        actorId: null,
        invitesPaused: false,
        lockedChannelIds: [],
        startedAt: null,
      };
    }

    return {
      active: true,
      actorId: state.actorId,
      invitesPaused: state.invitesPaused,
      lockedChannelIds: Object.keys(
        (state.lockedChannels ?? {}) as Record<string, unknown>,
      ),
      startedAt: state.startedAt.toISOString(),
    };
  });

  registerRpcHandler(RpcActions.guildPanicSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    const { active, channelIds } = parsePayload(PanicSetSchema, req.data);

    const security = tryGetUtility("security");
    if (!security) throw new Error("The security module is not loaded");
    const guild = cachedGuild(guildId);

    if (!active) {
      const reverted = await security.revertPanic(guild);
      if (!reverted) throw new Error("Panic mode is not active");
      return { success: true, active: false, ...reverted };
    }

    const existing = await container.db.security.getPanicState(guildId);
    if (existing) throw new Error("Panic mode is already active");

    const result = await security.enterPanic(guild, actorId, channelIds ?? []);
    return { success: true, active: true, ...result };
  });

  registerRpcHandler(RpcActions.guildVerificationPanelGet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const panel = await container.db.security.getVerificationPanel(guildId);

    return {
      panel: panel
        ? {
            channelId: panel.channelId,
            messageId: panel.messageId,
            createdAt: panel.createdAt.toISOString(),
          }
        : null,
    };
  });

  registerRpcHandler(RpcActions.guildVerificationPanelSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { channelId, messageId } = parsePayload(
      VerificationPanelSetSchema,
      req.data,
    );

    await container.db.ensureGuild(guildId);
    const panel = await container.db.security.saveVerificationPanel({
      guildId,
      channelId,
      messageId,
    });
    return {
      success: true,
      panel: { channelId: panel.channelId, messageId: panel.messageId },
    };
  });

  registerRpcHandler(RpcActions.guildVerificationPanelDelete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const deleted =
      await container.db.security.deleteVerificationPanel(guildId);
    return { success: true, deleted };
  });

  registerRpcHandler(RpcActions.guildVerificationWebComplete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = req.actorId;
    if (!actorId) throw new Error("actorId is required");
    SnowflakeSchema.parse(actorId);

    const security = tryGetUtility("security");
    if (!security) throw new Error("The security module is not loaded");

    const config = await security.loadVerificationConfig(guildId);
    if (!config.enabled || config.mode !== "web" || !config.verifiedRoleId) {
      throw new Error("Web verification is not enabled for this server");
    }

    const guild = cachedGuild(guildId);
    const granted = await security.grantVerified(guild, actorId);
    if (!granted) {
      throw new Error(
        "Couldn't grant the verified role - make sure you're a member of the server and try again.",
      );
    }
    return { success: true };
  });

  registerRpcHandler(RpcActions.guildBackupsList, async (req) => {
    const { guildId } = await verifyGuildAccess(req);
    const rows = await container.db.security.listBackups(guildId, 10);
    return {
      backups: rows.map((b) => {
        const data = b.data as unknown as GuildBackupData;
        return {
          id: b.id,
          createdAt: b.createdAt.toISOString(),
          roleCount: data.roles.length,
          channelCount: data.channels.length,
        };
      }),
    };
  });

  registerRpcHandler(RpcActions.guildBackupRestore, async (req) => {
    const { guild } = await verifyGuildAccess(req);
    const { backupId } = parsePayload(BackupRestoreSchema, req.data);

    const result = await restoreGuildFromBackup(guild, backupId);
    if (!result) throw new Error("No backup found to restore");
    return { success: true, ...result };
  });
}

export function unregisterSecurityRpcHandlers(): void {
  rpcHandlers.delete(RpcActions.guildPanicGet);
  rpcHandlers.delete(RpcActions.guildPanicSet);
  rpcHandlers.delete(RpcActions.guildVerificationPanelGet);
  rpcHandlers.delete(RpcActions.guildVerificationPanelSet);
  rpcHandlers.delete(RpcActions.guildVerificationPanelDelete);
  rpcHandlers.delete(RpcActions.guildVerificationWebComplete);
  rpcHandlers.delete(RpcActions.guildBackupsList);
  rpcHandlers.delete(RpcActions.guildBackupRestore);
}
