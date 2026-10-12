import type { AfkEntryView } from "#src/contracts/Views.js";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";

export const afkRpc = {
  "guild.afk.list": rpcAction<{ entries: AfkEntryView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List AFK entries.",
    readOnly: true,
  }),
};
