import { s } from "@sapphire/shapeshift";
import { rpcAction, RpcTimeouts } from "./define.js";
import { SnowflakeSchema } from "./schemas.js";

/** GDPR requester provenance (wire values of the bot's `RequesterType` enum). */
export const GdprRequesters = [
  "DISCORD_DELETED_USER",
  "OWNER",
  "USER",
  "USER_STRICT",
] as const;

export type GdprRequester = (typeof GdprRequesters)[number];

/** Lets the dashboard defer owner detection to the worker's `PermitResolver.isBotOwner`, which also recognizes the Discord application's owner. */
export interface WhoAmIResponse {
  isBotOwner: boolean;
}

/** Keyed by module name (core data under `"core"`). */
export type GdprExportResult = Record<string, unknown>;

export const accountRpc = {
  "auth.whoami": rpcAction<WhoAmIResponse>()({
    auth: "public",
    timeoutMs: RpcTimeouts.long,
    summary: "Returns { isBotOwner }; defers to the worker PermitResolver.",
  }),
  "global.gdpr.delete": rpcAction<{
    success: boolean;
    failedModules?: string[];
  }>()({
    input: s.object({
      userId: SnowflakeSchema,
      requester: s.enum(GdprRequesters).optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Erase a user's data.",
  }),
  "global.gdpr.export": rpcAction<{
    success: boolean;
    data: GdprExportResult;
  }>()({
    input: s.object({ userId: SnowflakeSchema }),
    auth: "session",
    timeoutMs: RpcTimeouts.long,
    summary: "Export a user's data, keyed by module.",
  }),
};
