import { s } from "@sapphire/shapeshift";
import type {
  AppealsListData,
  AppealVerifyResult,
  CasesListData,
  ModNoteView,
  WarnThresholdView,
} from "../views.js";
import { rpcAction, RpcTimeouts } from "./define.js";
import { PageSchema, PageSizeSchema, SnowflakeSchema } from "./schemas.js";

export const WarnThresholdActions = [
  "mute",
  "kick",
  "ban",
  "quarantine",
  "voice_mute",
] as const;

export type WarnThresholdAction = (typeof WarnThresholdActions)[number];

/** Actions applied for a fixed window - a rule without a parseable duration is unusable. */
export const WarnThresholdTimedActions = ["mute", "voice_mute"] as const;

export type WarnThresholdTimedAction =
  (typeof WarnThresholdTimedActions)[number];

export function isWarnThresholdAction(
  value: string,
): value is WarnThresholdAction {
  return (WarnThresholdActions as readonly string[]).includes(value);
}

export function warnThresholdNeedsDuration(
  action: WarnThresholdAction,
): action is WarnThresholdTimedAction {
  return (WarnThresholdTimedActions as readonly string[]).includes(action);
}

/** Reviewer-facing decisions - `pending` is the initial state, never set by a review call. */
export const AppealReviewStatuses = [
  "approved",
  "denied",
  "denied_blacklisted",
  "dismissed",
] as const;

export type AppealReviewStatus = (typeof AppealReviewStatuses)[number];

export const AppealStatuses = ["pending", ...AppealReviewStatuses] as const;

export type AppealStatus = (typeof AppealStatuses)[number];

const AppealTokenShape = {
  caseId: s.number().int().greaterThanOrEqual(1),
  /** The signed link param, verified entirely server-side. */
  token: s.string().lengthGreaterThanOrEqual(1),
};

export const modRpc = {
  "guild.cases.list": rpcAction<CasesListData>()({
    input: s.object({
      action: s
        .string()
        .lengthGreaterThanOrEqual(1)
        .lengthLessThanOrEqual(32)
        .optional(),
      userId: SnowflakeSchema.optional(),
      moderatorId: SnowflakeSchema.optional(),
      page: PageSchema,
      pageSize: PageSizeSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Paged moderation cases.",
  }),
  "guild.cases.revoke": rpcAction<{ success: boolean; caseNumber: number }>()({
    input: s.object({ caseNumber: s.number().int().greaterThanOrEqual(1) }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Revoke a case.",
  }),
  "guild.warnThresholds.list": rpcAction<{
    thresholds: WarnThresholdView[];
  }>()({
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "List warn-count escalation rules.",
  }),
  "guild.warnThresholds.set": rpcAction<{
    success: boolean;
    warnCount: number;
    deleted: boolean;
  }>()({
    input: s.object({
      warnCount: s.number().int().greaterThanOrEqual(1),
      /** `null` deletes the rule for `warnCount`. */
      action: s.enum(WarnThresholdActions).nullable(),
      duration: s.string().lengthLessThanOrEqual(32).nullable().optional(),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary:
      "Upsert a rule; null action deletes it. mute/voice_mute need a duration.",
  }),
  "guild.modNotes.list": rpcAction<{ notes: ModNoteView[] }>()({
    input: s.object({ userId: SnowflakeSchema }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Moderator notes for a user.",
  }),
  "guild.modNotes.add": rpcAction<{ success: boolean; note: ModNoteView }>()({
    input: s.object({
      userId: SnowflakeSchema,
      message: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(1000),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Add a moderator note.",
  }),
  "guild.modNotes.remove": rpcAction<{ success: boolean; deleted: boolean }>()({
    input: s.object({ id: s.number().int().greaterThanOrEqual(1) }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Remove a moderator note.",
  }),
  "guild.appeals.verify": rpcAction<AppealVerifyResult>()({
    input: s.object(AppealTokenShape),
    auth: "public",
    timeoutMs: RpcTimeouts.long,
    summary: "Verify an appeal link token.",
  }),
  "guild.appeals.submit": rpcAction<{
    success: boolean;
    appeal: { id: number; status: string; createdAt: string };
  }>()({
    input: s.object({
      ...AppealTokenShape,
      message: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(2000),
    }),
    auth: "public",
    timeoutMs: RpcTimeouts.long,
    summary: "Submit an appeal message.",
  }),
  "guild.appeals.list": rpcAction<AppealsListData>()({
    input: s.object({
      status: s.enum(AppealStatuses).optional(),
      page: PageSchema,
      pageSize: PageSizeSchema,
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.short,
    summary: "Paged appeals for reviewers.",
  }),
  "guild.appeals.review": rpcAction<{
    success: boolean;
    appeal: {
      id: number;
      status: string;
      reviewedBy: string | null;
      reviewedAt: string | null;
    };
  }>()({
    input: s.object({
      id: s.number().int().greaterThanOrEqual(1),
      status: s.enum(AppealReviewStatuses),
    }),
    auth: "guildManager",
    timeoutMs: RpcTimeouts.long,
    summary: "Approve, deny, blacklist-deny, or dismiss.",
  }),
};
