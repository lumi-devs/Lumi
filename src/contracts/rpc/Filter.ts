import { z } from "zod";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";

export const filterRpc = {
  "guild.filter.status": rpcAction<{
    lockdownActive: boolean;
    heatPanicActive: boolean;
  }>()({
    input: z.object({}),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Auto-lockdown and heat-panic state.",
    readOnly: true,
  }),
  "guild.filter.lockdown.release": rpcAction<{ success: boolean }>()({
    input: z.object({}),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Release an active auto-lockdown.",
  }),
};
