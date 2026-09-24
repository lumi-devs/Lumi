import { container } from "@sapphire/framework";
import { afkRpc } from "@lumi/contracts/rpc";
import { implementRpc } from "#lib/rpc/implement.js";

export const afkRpcHandlers = implementRpc(afkRpc, {
  "guild.afk.list": async ({ guildId }) => {
    const entries = await container.db.afk.findForGuild(guildId);
    return {
      entries: entries.map((e) => ({
        userId: e.userId,
        reason: e.reason,
        since: e.since.toISOString(),
      })),
    };
  },
});
