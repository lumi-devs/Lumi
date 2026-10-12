import { z } from "zod";
import { rpcAction, RpcTimeouts } from "#src/contracts/rpc/Define.js";
import { SnowflakeSchema } from "#src/contracts/rpc/Schemas.js";

export const GdprRequesters = [
  "DISCORD_DELETED_USER",
  "OWNER",
  "USER",
  "USER_STRICT",
] as const;

export type GdprRequester = (typeof GdprRequesters)[number];

export interface WhoAmIResponse {
  isBotOwner: boolean;
}

export type GdprExportResult = Record<string, unknown>;

export const GdprExportJobStatuses = [
  "pending",
  "running",
  "done",
  "failed",
] as const;
export type GdprExportJobStatus = (typeof GdprExportJobStatuses)[number];

export interface GdprExportJobStartResponse {
  jobId: string;
}

export interface GdprExportDownload {
  token: string;
  expiresAt: string;
}

export interface GdprExportJobStatusResponse {
  status: GdprExportJobStatus;
  error?: string | undefined;
  sizeBytes?: number | undefined;
  createdAt: string;
  completedAt?: string | undefined;
  expiresAt?: string | undefined;
  download?: GdprExportDownload | undefined;
}

export const accountRpc = {
  "auth.whoami": rpcAction<WhoAmIResponse>()({
    auth: "public",
    timeoutMs: RpcTimeouts.long,
    summary: "Returns { isBotOwner }; defers to the worker PermitResolver.",
    readOnly: true,
  }),
  "global.gdpr.delete": rpcAction<{
    success: boolean;
    failedModules?: string[];
  }>()({
    input: z.object({
      userId: SnowflakeSchema,
      requester: z.enum(GdprRequesters).optional(),
    }),
    auth: "botOwner",
    timeoutMs: RpcTimeouts.long,
    summary: "Erase a user's data.",
  }),
  "global.gdpr.export": rpcAction<{
    success: boolean;
    data: GdprExportResult;
  }>()({
    input: z.object({ userId: SnowflakeSchema }),
    auth: "session",
    timeoutMs: RpcTimeouts.long,
    summary: "Export a user's data, keyed by module.",
  }),
  "global.gdpr.export.start": rpcAction<GdprExportJobStartResponse>()({
    input: z.object({ userId: SnowflakeSchema }),
    auth: "session",
    timeoutMs: RpcTimeouts.long,
    summary:
      "Start an async export of a user's data on the scheduled-tasks queue; returns a job id to poll.",
  }),
  "global.gdpr.export.status": rpcAction<GdprExportJobStatusResponse>()({
    input: z.object({ jobId: z.string() }),
    auth: "session",
    timeoutMs: RpcTimeouts.long,
    summary:
      "Poll an async GDPR export job; returns a short-lived signed download token once status is done.",
    readOnly: true,
  }),
};
