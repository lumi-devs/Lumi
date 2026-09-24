import type { AfkEntryView } from "../views";
import { rpcAction, RpcTimeouts } from "./define";

export const afkRpc = {
  "guild.afk.list": rpcAction<{ entries: AfkEntryView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List AFK entries.",
  }),
};
