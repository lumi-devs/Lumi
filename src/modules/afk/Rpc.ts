import { container } from "#src/lib/Services.js";
import { afkRpc } from "#src/contracts/rpc/Index.ts";
import { implementRpc } from "#src/lib/rpc/Implement.js";

export const afkRpcHandlers = implementRpc(afkRpc, {
  "guild.afk.list": async ({ guildId }) => {
    const entries = await container.db.afk.findForGuild(guildId);
    return {
      entries: entries.map((entry) => ({
        userId: entry.userId,
        reason: entry.reason,
        since: entry.since.toISOString(),
      })),
    };
  },
});
