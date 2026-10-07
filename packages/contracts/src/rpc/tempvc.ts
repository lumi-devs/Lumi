import { z } from "zod";
import type { TempVcGeneratorView, TempVcRecordView } from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";
import { SnowflakeSchema } from "./schemas.js";

export const tempvcRpc = {
  "guild.tempvc.generators.list": rpcAction<{
    generators: TempVcGeneratorView[];
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List temporary-voice generator channels.",
    readOnly: true,
  }),
  "guild.tempvc.generators.set": rpcAction<{
    success: boolean;
    channelId: string;
    deleted: boolean;
  }>()({
    input: z.object({
      channelId: SnowflakeSchema,
      /** `null` deletes the generator on `channelId`. */
      name: z.string().min(1).max(100).nullable(),
      limit: z.number().int().gte(0).lte(99).optional(),
    }),
    auth: "guildManager",
    requiresEnabled: "tempvc",
    timeoutMs: RpcTimeouts.long,
    summary: "Upsert a generator; null name deletes it.",
  }),
  "guild.tempvc.records.list": rpcAction<{ records: TempVcRecordView[] }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List temporary-voice records.",
    readOnly: true,
  }),
};
