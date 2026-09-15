import { container } from "@sapphire/framework";
import { coreRpc } from "@lumi/contracts/rpc";
import { getUtility } from "#lib/module-system/Utility.js";
import { implementRpc } from "#lib/rpc/implement.js";
import { paginate } from "#lib/rpc/validation.js";

export const coreRpcHandlers = implementRpc(coreRpc, {
  "guild.permits.list": async ({ guildId }) => ({
    permits: await getUtility("permissions").listPermits(guildId),
  }),

  "guild.permits.create": async ({ guildId, input }) => {
    const permit = await getUtility("permissions").createPermit(
      guildId,
      input.name,
      input.kind,
      input.nodes,
    );
    return { success: true, permit };
  },

  "guild.permits.update": async ({ guildId, input }) => {
    const permissions = getUtility("permissions");
    if (input.name !== undefined) {
      await permissions.renamePermit(guildId, input.permitId, input.name);
    }
    const permit =
      input.nodes !== undefined
        ? await permissions.updatePermitNodes(guildId, input.permitId, input.nodes)
        : await permissions.getPermit(guildId, input.permitId);
    return { success: true, permit };
  },

  "guild.permits.delete": async ({ guildId, input }) => {
    await getUtility("permissions").deletePermit(guildId, input.permitId);
    return { success: true };
  },

  "guild.permits.assign": async ({ guildId, input }) => {
    await getUtility("permissions").assignPermit(
      guildId,
      input.permitId,
      input.targetType,
      input.targetId,
    );
    return { success: true };
  },

  "guild.permits.unassign": async ({ guildId, input }) => {
    await getUtility("permissions").unassignPermit(
      guildId,
      input.permitId,
      input.targetType,
      input.targetId,
    );
    return { success: true };
  },

  "guild.blocklist.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } = await container.db.access.listBlocklist(guildId, {
      skip,
      take,
    });
    return {
      entries: entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        reason: e.reason,
        blockedBy: e.blockedBy,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  },

  "guild.blocklist.add": async ({ guildId, actorId, input }) => {
    if (await container.db.access.isUserBlocklisted(input.userId, guildId)) {
      throw new Error(`${input.userId} is already blocklisted in this server`);
    }
    await container.db.access.addBlocklistEntry(
      input.userId,
      actorId,
      input.reason,
      guildId,
    );
    return { success: true, userId: input.userId };
  },

  "guild.blocklist.remove": async ({ guildId, input }) => {
    await container.db.access.removeBlocklistEntry(input.userId, guildId);
    return { success: true, userId: input.userId };
  },

  "guild.ignored.list": async ({ guildId }) => {
    const entries = await container.db.access.listIgnoreEntries(guildId);
    return {
      entries: entries.map((e) => ({
        id: e.id,
        channelId: e.channelId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  },

  "guild.ignored.add": async ({ guildId, input }) => {
    const { channelId } = input;
    const existing = await container.db.access.listIgnoreEntries(guildId);
    if (existing.some((e) => e.channelId === channelId)) {
      throw new Error(
        channelId
          ? `<#${channelId}> is already ignored`
          : "This server is already ignored",
      );
    }

    await container.db.ensureGuild(guildId);
    await container.db.access.addIgnoreEntry(guildId, channelId);
    return { success: true, channelId };
  },

  "guild.ignored.remove": async ({ guildId, input }) => {
    await container.db.access.removeIgnoreEntry(guildId, input.channelId);
    return { success: true, channelId: input.channelId };
  },
});
