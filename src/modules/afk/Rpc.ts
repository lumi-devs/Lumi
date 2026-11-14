import { container } from "@lib/Services.js";
import { afkRpc } from "@contracts/rpc/Index.ts";
import { implementRpc } from "@rpc/Implement.js";

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
