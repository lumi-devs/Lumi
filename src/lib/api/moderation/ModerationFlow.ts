import type { CommandContext } from "#src/lib/commands/Context.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import {
  confirmPrompt,
  type ConfirmPromptContext,
  type ConfirmPromptOptions,
} from "#src/lib/utilities/Confirm.js";
import { logError } from "#src/lib/utilities/Errors.js";
import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";
import { isNullish } from "#src/shared/Index.ts";
import { Time } from "#src/shared/Index.ts";
import { Result, type Awaitable } from "#src/shared/Index.ts";
import type { Container } from "#src/lib/Services.js";
import type { Guild, GuildMember, User } from "discord.js";
import type { CaseAction } from "@prisma/client";

const Root = "commands";

function targetIdOf(target: ModerationCommand.TargetLike): string {
  return typeof target === "string" ? target : target.id;
}

export interface HierarchyCheckContext {
  guild: Guild | null;
  member: GuildMember | null;
}

export interface DuplicateCaseCheckContext
  extends HierarchyCheckContext,
    ConfirmPromptContext {
  services: Container;
}

function isOwnerBypass(ctx: HierarchyCheckContext): boolean {
  const guild = ctx.guild;
  const moderator = ctx.member;
  if (!guild || !moderator) return false;
  return guild.ownerId === moderator.id;
}

async function readReason(ctx: CommandContext, t: LumiT): Promise<string> {
  return (
    (await ctx.getString("reason", { rest: true })) ?? t(`${Root}:modNoReason`)
  );
}

function replyFailure(
  ctx: CommandContext,
  reply: ModerationCommand.Reply,
): Promise<void> {
  return ctx.replyError(reply.title, reply.body);
}

function memberNotFound(t: LumiT): ModerationCommand.Reply {
  return {
    title: t(`${Root}:modMemberNotFoundTitle`),
    body: t(`${Root}:modMemberNotFound`),
  };
}

function actionFailed(t: LumiT): ModerationCommand.Reply {
  return {
    title: t(`${Root}:modActionFailedTitle`),
    body: t(`${Root}:modActionFailed`),
  };
}

async function checkPanicLock(
  ctx: CommandContext,
  t: LumiT,
): Promise<ModerationCommand.Reply | null> {
  const guild = ctx.guild;
  const moderator = ctx.member;
  if (isOwnerBypass(ctx) || !guild || !moderator) return null;

  const locked = await ctx.services.db.config.getModuleConfig(
    guild.id,
    "security",
    "panic_lock_mod_commands",
  );
  if (locked !== true) return null;

  const state = await ctx.services.db.security.getPanicState(guild.id);
  if (!state) return null;
  if (state.actorId === moderator.id) return null;

  return {
    title: t(`${Root}:modPanicLockedTitle`),
    body: t(`${Root}:modPanicLocked`),
  };
}

export async function checkDuplicateCase(
  ctx: DuplicateCaseCheckContext,
  t: LumiT,
  targetId: string,
  action: CaseAction,
): Promise<boolean> {
  const guild = ctx.guild;
  if (!guild) return true;

  const windowRaw = await ctx.services.db.config.getModuleConfig(
    guild.id,
    "mod",
    "duplicate_case_window_minutes",
  );
  const windowMinutes = typeof windowRaw === "number" ? windowRaw : 5;
  if (windowMinutes <= 0) return true;

  const [recent] = await ctx.services.db.moderation.getModerationCases(
    guild.id,
    targetId,
    action,
  );
  if (!recent) return true;

  const ageMinutes = (Date.now() - recent.createdAt.getTime()) / Time.Minute;
  if (ageMinutes > windowMinutes) return true;

  const result = await confirmPrompt(ctx, {
    title: t(`${Root}:modDuplicateCaseTitle`),
    body: t(`${Root}:modDuplicateCaseBody`, {
      caseNumber: recent.caseNumber,
      user: `<@${targetId}>`,
      minutes: Math.round(ageMinutes),
      moderator: `<@${recent.moderatorId}>`,
    }),
    confirmLabel: t(`${Root}:modDuplicateCaseButton`),
  });
  return result.confirmed;
}

export async function checkHierarchy(
  ctx: HierarchyCheckContext,
  target: ModerationCommand.TargetLike,
  t: LumiT,
): Promise<ModerationCommand.Reply | null> {
  const guild = ctx.guild;
  const moderator = ctx.member;
  if (isOwnerBypass(ctx) || !guild || !moderator) return null;

  const targetId = targetIdOf(target);
  if (targetId === moderator.id) return null;

  const deny = (user: string): ModerationCommand.Reply => ({
    title: t(`${Root}:modHierarchyTitle`),
    body: t(`${Root}:modHierarchy`, { user }),
  });

  if (targetId === guild.ownerId) return deny(`<@${targetId}>`);

  const targetMember =
    typeof target === "object" && "roles" in target
      ? (target as GuildMember)
      : (guild.members.cache.get(targetId) ??
        (await guild.members.fetch(targetId).catch(() => null)));
  if (!targetMember) return null;

  return targetMember.roles.highest.position >= moderator.roles.highest.position
    ? deny(`<@${targetId}>`)
    : null;
}

interface PreparedEntry<Target, Prepared> {
  target: Target;
  prepared: Prepared;
}

interface RejectedEntry<Target> {
  target: Target;
  reply: ModerationCommand.Reply;
}

const DefaultBatchConcurrency = 1;

const BatchStaggerMs = 250;

function rejectedLine<Target extends ModerationCommand.TargetLike>(
  entry: RejectedEntry<Target>,
): string {
  return `❌ <@${targetIdOf(entry.target)}> - ${entry.reply.body}`;
}

function replyBatchResult<
  Target extends ModerationCommand.TargetLike,
  Outcome,
  Prepared,
>(
  ctx: CommandContext,
  t: LumiT,
  flow: ModerationCommand.Flow<Target, Outcome, Prepared>,
  successes: ModerationCommand.OutcomeContext<Target, Outcome, Prepared>[],
  rejected: RejectedEntry<Target>[],
): Promise<void> {
  if (successes.length === 1 && rejected.length === 0) {
    const success = flow.buildSuccessMessage(t, successes[0]!);
    return ctx.replySuccess(success.title, success.body);
  }

  const lines = [
    ...successes.map((outcomeContext) => {
      const success = flow.buildSuccessMessage(t, outcomeContext);
      return `✅ <@${targetIdOf(outcomeContext.target)}> - ${success.body}`;
    }),
    ...rejected.map(rejectedLine),
  ];

  const total = successes.length + rejected.length;
  const title = `${successes.length}/${total} succeeded`;
  const body = lines.join("\n");

  return successes.length > 0
    ? ctx.replySuccess(title, body)
    : ctx.replyError(title, body);
}

export async function runModerationFlow<
  Target extends ModerationCommand.TargetLike,
  Outcome,
  Prepared,
>(
  ctx: CommandContext,
  flow: ModerationCommand.Flow<Target, Outcome, Prepared>,
): Promise<void> {
  const { logScope } = flow;

  await ctx.defer();
  const t = await ctx.fetchT();

  const panicLocked = await checkPanicLock(ctx, t);
  if (panicLocked) return replyFailure(ctx, panicLocked);

  const resolved = await flow.resolveTarget(ctx, t);
  const targets: Target[] = Array.isArray(resolved)
    ? resolved
    : isNullish(resolved)
      ? []
      : [resolved];
  if (targets.length === 0) {
    return replyFailure(ctx, flow.targetNotFound?.(t) ?? memberNotFound(t));
  }

  const prepared: PreparedEntry<Target, Prepared>[] = [];
  const rejected: RejectedEntry<Target>[] = [];

  for (const target of targets) {
    const outranked = await checkHierarchy(ctx, target, t);
    if (outranked) {
      rejected.push({ target, reply: outranked });
      continue;
    }

    const result: Result<Prepared, ModerationCommand.Reply> = flow.preHandle
      ? await flow.preHandle(ctx, t, target)
      : Result.ok(null as Prepared);
    if (result.isErr()) {
      rejected.push({ target, reply: result.error });
      continue;
    }

    prepared.push({ target, prepared: result.unwrap() });
  }

  const reason = flow.resolveReason
    ? await flow.resolveReason(ctx, t)
    : await readReason(ctx, t);

  if (prepared.length === 0) {

    if (rejected.length === 1) {
      return replyFailure(ctx, rejected[0]!.reply);
    }
    return replyBatchResult(ctx, t, flow, [], rejected);
  }

  if (flow.duplicateCaseAction && prepared.length === 1) {
    const proceed = await checkDuplicateCase(
      ctx,
      t,
      targetIdOf(prepared[0]!.target),
      flow.duplicateCaseAction,
    );
    if (!proceed) return;
  }

  if (flow.confirm) {
    const sample: ModerationCommand.ActionContext<Target, Prepared> = {
      guild: ctx.guild!,
      target: prepared[0]!.target,
      moderator: ctx.user,
      reason,
      prepared: prepared[0]!.prepared,
    };
    const promptOpts = await flow.confirm(t, sample);
    if (promptOpts) {
      const finalOpts =
        prepared.length > 1
          ? {
              ...promptOpts,
              body: `${prepared.map((e) => `<@${targetIdOf(e.target)}>`).join(", ")}\n\n${reason}`,
            }
          : promptOpts;
      const promptRes = await confirmPrompt(ctx, finalOpts);
      if (!promptRes.confirmed) {
        return;
      }
    }
  }

  const successes: ModerationCommand.OutcomeContext<Target, Outcome, Prepared>[] =
    [];

  const runOne = async ({
    target,
    prepared: preparedValue,
  }: PreparedEntry<Target, Prepared>): Promise<void> => {
    const context: ModerationCommand.ActionContext<Target, Prepared> = {
      guild: ctx.guild!,
      target,
      moderator: ctx.user,
      reason,
      prepared: preparedValue,
    };

    if (logScope === undefined) {
      const outcome = await flow.action(context);
      successes.push({ ...context, outcome });
      return;
    }

    try {
      const outcome = await flow.action(context);
      successes.push({ ...context, outcome });
    } catch (error: unknown) {
      const expected = flow.mapExpectedError?.(t, error, context) ?? null;
      if (expected) {
        rejected.push({ target, reply: expected });
        return;
      }
      logError(
        `${logScope}: guild=${context.guild.id} target=${targetIdOf(target)}`,
        error,
      );
      rejected.push({
        target,
        reply: flow.buildFailureMessage?.(t, context) ?? actionFailed(t),
      });
    }
  };

  if (prepared.length === 1) {
    await runOne(prepared[0]!);
  } else {

    await mapWithConcurrency(prepared, DefaultBatchConcurrency, async (entry) => {
      await runOne(entry);
      await Bun.sleep(BatchStaggerMs);
    });
  }

  return replyBatchResult(ctx, t, flow, successes, rejected);
}

export namespace ModerationCommand {
  export type RunContext = CommandContext;

  export type TargetLike = string | { id: string };

  export interface Reply {
    title: string;
    body: string;
  }

  export interface ActionContext<Target extends TargetLike, Prepared = null> {
    guild: Guild;
    target: Target;
    moderator: User;
    reason: string;

    prepared: Prepared;
  }

  export interface OutcomeContext<
    Target extends TargetLike,
    Outcome,
    Prepared = null,
  > extends ActionContext<Target, Prepared> {

    outcome: Outcome;
  }

  export interface Flow<Target extends TargetLike, Outcome, Prepared = null> {
    logScope?: string;

    duplicateCaseAction?: CaseAction;
    resolveTarget(
      ctx: CommandContext,
      t: LumiT,
    ): Awaitable<Target | Target[] | null>;
    targetNotFound?(t: LumiT): Reply;
    preHandle?(
      ctx: CommandContext,
      t: LumiT,
      target: Target,
    ): Awaitable<Result<Prepared, Reply>>;
    resolveReason?(ctx: CommandContext, t: LumiT): Awaitable<string>;
    confirm?(
      t: LumiT,
      context: ActionContext<Target, Prepared>,
    ): Awaitable<ConfirmPromptOptions | null | undefined>;
    action(context: ActionContext<Target, Prepared>): Promise<Outcome>;
    mapExpectedError?(
      t: LumiT,
      error: unknown,
      context: ActionContext<Target, Prepared>,
    ): Reply | null;
    buildFailureMessage?(
      t: LumiT,
      context: ActionContext<Target, Prepared>,
    ): Reply;
    buildSuccessMessage(
      t: LumiT,
      context: OutcomeContext<Target, Outcome, Prepared>,
    ): Reply;
  }
}
