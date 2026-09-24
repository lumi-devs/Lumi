import { s } from "@sapphire/shapeshift";
import type { TempVcGeneratorView, TempVcRecordView } from "../views";
import { rpcAction, RpcTimeouts } from "./define";
import { SnowflakeSchema } from "./schemas";

export const tempvcRpc = {
  "guild.tempvc.generators.list": rpcAction<{
    generators: TempVcGeneratorView[];
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List temporary-voice generator channels.",
  }),
  "guild.tempvc.generators.set": rpcAction<{
    success: boolean;
    channelId: string;
    deleted: boolean;
  }>()({
    input: s.object({
      channelId: SnowflakeSchema,
      /** `null` deletes the generator on `channelId`. */
      name: s
        .string()
        .lengthGreaterThanOrEqual(1)
        .lengthLessThanOrEqual(100)
        .nullable(),
      limit: s.number().int().greaterThanOrEqual(0).lessThanOrEqual(99).optional(),
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
  }),
};
