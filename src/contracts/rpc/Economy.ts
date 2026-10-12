import { z } from "zod";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";
import { PageSizeSchema, SnowflakeSchema } from "#src/contracts/rpc/Schemas.js";

export const economyRpc = {
  "guild.economy.balance": rpcAction<{
    wallet: number;
    bank: number;
    total: number;
  }>()({
    input: z.object({ userId: SnowflakeSchema }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Wallet and bank balance for a member.",
    readOnly: true,
  }),
  "guild.economy.leaderboard": rpcAction<{
    entries: { userId: string; wallet: number; bank: number; total: number; rank: number }[];
    total: number;
  }>()({
    input: z.object({ pageSize: PageSizeSchema }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Economy leaderboard page.",
    readOnly: true,
  }),
  "guild.economy.adjust": rpcAction<{
    success: boolean;
    wallet: number;
    bank: number;
    total: number;
  }>()({
    input: z.object({
      userId: SnowflakeSchema,
      operation: z.enum(["add", "remove", "set"]),
      amount: z.number().int().gte(0),
      vault: z.enum(["wallet", "bank"]),
      reason: z.string().min(1).max(500),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Adjust a member balance (dashboard audit).",
  }),
};
