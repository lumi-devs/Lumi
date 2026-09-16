import { container } from "@sapphire/framework";
import { SnowflakeSchema, securityRpc } from "@lumi/contracts/rpc";
import type { GuildBackupData } from "./services/backup-types.js";
import { restoreGuildFromBackup } from "./services/restore-guild.js";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  cachedGuild,
  implementRpc,
  requireGuildId,
} from "#lib/rpc/implement.js";

export const securityRpcHandlers = implementRpc(securityRpc, {
  "guild.panic.get": async ({ guildId }) => {
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
  },

  "guild.panic.set": async ({ guildId, guild, actorId, input }) => {
    const security = getUtility("security");
    if (!input.active) {
      const reverted = await security.revertPanic(guild);
      if (!reverted) throw new Error("Panic mode is not active");
      return { success: true, active: false, ...reverted };
    }

    if (await container.db.security.getPanicState(guildId)) {
      throw new Error("Panic mode is already active");
    }
    const result = await security.enterPanic(guild, actorId, input.channelIds ?? []);
    return { success: true, active: true, ...result };
  },

  "guild.verificationPanel.get": async ({ guildId }) => {
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
  },

  "guild.verificationPanel.set": async ({ guildId, guild, input }) => {
    if (!input.channelId && !input.createChannel) {
      throw new Error("Pick a channel or choose to create a new one.");
    }
    await container.db.ensureGuild(guildId);
    const result = await getUtility("security").postOrEditVerifyPanel(guild, {
      channelId: input.channelId,
      createChannel: input.createChannel,
      deleteOldMessage: input.deleteOldMessage,
    });
    return { success: true, ...result };
  },

  "guild.verificationPanel.delete": async ({ guildId }) => {
    const deleted = await container.db.security.deleteVerificationPanel(guildId);
    return { success: true, deleted };
  },

  "guild.verificationWeb.complete": async ({ guildId, actorId }) => {
    const verifiedGuildId = requireGuildId(guildId);
    SnowflakeSchema.parse(actorId);

    const security = getUtility("security");
    const config = await security.loadVerificationConfig(verifiedGuildId);
    if (!config.enabled || config.mode !== "web" || !config.verifiedRoleId) {
      throw new Error("Web verification is not enabled for this server");
    }

    const granted = await security.grantVerified(
      cachedGuild(verifiedGuildId),
      actorId,
    );
    if (!granted) {
      throw new Error(
        "Couldn't grant the verified role - make sure you're a member of the server and try again.",
      );
    }
    return { success: true };
  },

  "guild.backups.list": async ({ guildId }) => {
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
  },

  "guild.backups.restore": async ({ guild, input }) => {
    const result = await restoreGuildFromBackup(guild, input.backupId);
    if (!result) throw new Error("No backup found to restore");
    return { success: true, ...result };
  },
});
