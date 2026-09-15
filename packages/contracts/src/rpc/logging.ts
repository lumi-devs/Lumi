import { s } from "@sapphire/shapeshift";
import { rpcAction, RpcTimeouts } from "./define.js";
import { SnowflakeSchema } from "./schemas.js";

/** One channel pending as a log destination, claimed by posting a claim code in Discord. */
export interface LogClaimView {
  channelId: string;
  authorId: string;
  messageId: string;
  claimedAt: string;
}

export const LogClaimOutcomes = ["confirmed", "dismissed"] as const;

export type LogClaimOutcome = (typeof LogClaimOutcomes)[number];

export const loggingRpc = {
  "guild.logClaims.list": rpcAction<{ claims: LogClaimView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List channels pending as log destinations.",
  }),
  "guild.logClaims.issue": rpcAction<{ code: string; expiresIn: number }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Issue a one-time code to claim a log channel.",
  }),
  "guild.logClaims.dismiss": rpcAction<{
    success: boolean;
    dismissed: boolean;
  }>()({
    input: s.object({
      channelId: SnowflakeSchema,
      outcome: s.enum(LogClaimOutcomes),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Resolve a claim as confirmed or dismissed; audit-logged.",
  }),
};
