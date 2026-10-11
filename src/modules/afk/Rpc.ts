import { container } from "#src/lib/Services.js";
import { afkRpc } from "#src/contracts/rpc/Index.ts";
import { implementRpc } from "#src/lib/rpc/Implement.js";

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
