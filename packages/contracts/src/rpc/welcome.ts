import { s } from "@sapphire/shapeshift";
import { rpcAction, RpcTimeouts } from "./define.js";

export const WelcomeTestKinds = ["welcome", "goodbye"] as const;

export type WelcomeTestKind = (typeof WelcomeTestKinds)[number];

export const welcomeRpc = {
  "guild.welcome.sendTest": rpcAction<{ sent: boolean }>()({
    input: s.object({ kind: s.enum(WelcomeTestKinds) }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Send a test welcome or goodbye message to a guild channel.",
  }),
};
