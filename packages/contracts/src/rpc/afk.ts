import type { AfkEntryView } from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";

export const afkRpc = {
  "guild.afk.list": rpcAction<{ entries: AfkEntryView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List AFK entries.",
  }),
};
