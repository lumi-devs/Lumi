import { container } from "@sapphire/framework";
import { tempvcRpc } from "@lumi/contracts/rpc";
import { getUtility } from "#lib/module-system/Utility.js";
import { implementRpc } from "#lib/rpc/implement.js";

export const tempvcRpcHandlers = implementRpc(tempvcRpc, {
  "guild.tempvc.generators.list": async ({ guildId }) => {
    const generators = await container.db.tempvc.listGenerators(guildId);
    return {
      generators: generators.map((g) => ({
        channelId: g.channelId,
        name: g.name,
        limit: g.limit,
      })),
    };
  },

  // Routed through the tempvc service rather than `db.tempvc` so its
  // in-memory generator registry is invalidated across every shard.
  "guild.tempvc.generators.set": async ({ guildId, input }) => {
    const { channelId, name, limit } = input;
    const tempvc = getUtility("tempvc");

    if (name === null) {
      const deleted = await tempvc.removeGenerator(guildId, channelId);
      return { success: true, channelId, deleted };
    }

    await container.db.ensureGuild(guildId);
    await tempvc.addGenerator(guildId, channelId, { name, limit: limit ?? 0 });
    return { success: true, channelId, deleted: false };
  },

  "guild.tempvc.records.list": async ({ guildId }) => {
    const records = await container.db.tempvc.listRecords(guildId);
    return {
      records: records.map((r) => ({
        channelId: r.channelId,
        ownerId: r.ownerId,
        generatorId: r.generatorId,
        name: r.name,
        number: r.number,
        locked: r.locked,
        hidden: r.hidden,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
});
