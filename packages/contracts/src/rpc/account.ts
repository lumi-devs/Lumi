import { z } from "zod";
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

/** Wire values of the `GdprExportJobStatus` Prisma enum. */
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

/** A short-lived, signed token for `GET /gdpr-export` on `apps/api`, present only once the job is `done`. */
export interface GdprExportDownload {
  token: string;
  expiresAt: string;
}

export interface GdprExportJobStatusResponse {
  status: GdprExportJobStatus;
  error?: string;
  sizeBytes?: number;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  download?: GdprExportDownload;
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
