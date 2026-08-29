import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { tryGetService } from "#lib/module-system/Service.js";
import type { GuildBackupData } from "#modules/security/lib/backup.js";
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
  registerRpcHandler(RPC_ACTIONS.guildPanicGet, async (req) => {
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

  registerRpcHandler(RPC_ACTIONS.guildPanicSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    const { active, channelIds } = parsePayload(PanicSetSchema, req.data);

    const security = tryGetService("security");
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

  registerRpcHandler(RPC_ACTIONS.guildVerificationPanelGet, async (req) => {
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

  registerRpcHandler(RPC_ACTIONS.guildVerificationPanelSet, async (req) => {
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

  registerRpcHandler(RPC_ACTIONS.guildVerificationPanelDelete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const deleted =
      await container.db.security.deleteVerificationPanel(guildId);
    return { success: true, deleted };
  });

  registerRpcHandler(RPC_ACTIONS.guildVerificationWebComplete, async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = req.actorId;
    if (!actorId) throw new Error("actorId is required");
    SnowflakeSchema.parse(actorId);

    const security = tryGetService("security");
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

  registerRpcHandler(RPC_ACTIONS.guildBackupsList, async (req) => {
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

  registerRpcHandler(RPC_ACTIONS.guildBackupRestore, async (req) => {
    const { guild } = await verifyGuildAccess(req);
    const { backupId } = parsePayload(BackupRestoreSchema, req.data);

    const security = tryGetService("security");
    if (!security) throw new Error("The security module is not loaded");

    const result = await security.restoreFromBackup(guild, backupId);
    if (!result) throw new Error("No backup found to restore");
    return { success: true, ...result };
  });
}

export function unregisterSecurityRpcHandlers(): void {
  rpcHandlers.delete(RPC_ACTIONS.guildPanicGet);
  rpcHandlers.delete(RPC_ACTIONS.guildPanicSet);
  rpcHandlers.delete(RPC_ACTIONS.guildVerificationPanelGet);
  rpcHandlers.delete(RPC_ACTIONS.guildVerificationPanelSet);
  rpcHandlers.delete(RPC_ACTIONS.guildVerificationPanelDelete);
  rpcHandlers.delete(RPC_ACTIONS.guildVerificationWebComplete);
  rpcHandlers.delete(RPC_ACTIONS.guildBackupsList);
  rpcHandlers.delete(RPC_ACTIONS.guildBackupRestore);
}
