import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import { RPC_ACTIONS } from "@lumi/contracts";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import {
  TempVcGeneratorSetSchema,
  parsePayload,
  requireGuildId,
  requireGuildManager,
} from "../lib/helpers.js";

export function registerTempVcRpcHandlers(): void {
  registerRpcHandler(RPC_ACTIONS.guildTempVcGeneratorsList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const generators = await container.db.tempvc.listGenerators(guildId);

    return {
      generators: generators.map((g) => ({
        channelId: g.channelId,
        name: g.name,
        limit: g.limit,
      })),
    };
  });

  // Routed through the tempvc service rather than `db.tempvc` so its
  // in-memory generator registry is invalidated across every shard.
  registerRpcHandler(RPC_ACTIONS.guildTempVcGeneratorSet, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
    const { channelId, name, limit } = parsePayload(
      TempVcGeneratorSetSchema,
      req.data,
    );

    const tempvc = tryGetUtility("tempvc");
    if (!tempvc) throw new Error("The tempvc module is not loaded");

    if (name === null) {
      const deleted = await tempvc.removeGenerator(guildId, channelId);
      return { success: true, channelId, deleted };
    }

    await container.db.ensureGuild(guildId);
    await tempvc.addGenerator(guildId, channelId, {
      name,
      limit: limit ?? 0,
    });
    return { success: true, channelId, deleted: false };
  });

  registerRpcHandler(RPC_ACTIONS.guildTempVcRecordsList, async (req) => {
    const guildId = requireGuildId(req.guildId);
    await requireGuildManager(guildId, req.actorId);
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
  });
}

export function unregisterTempVcRpcHandlers(): void {
  rpcHandlers.delete(RPC_ACTIONS.guildTempVcGeneratorsList);
  rpcHandlers.delete(RPC_ACTIONS.guildTempVcGeneratorSet);
  rpcHandlers.delete(RPC_ACTIONS.guildTempVcRecordsList);
}
