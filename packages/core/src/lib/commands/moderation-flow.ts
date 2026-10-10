import type { CommandContext } from "@lumi/lib/commands/context.js";
import type { LumiT } from "@lumi/lib/i18n/index.js";
import {
  confirmPrompt,
  type ConfirmPromptContext,
  type ConfirmPromptOptions,
} from "@lumi/lib/utilities/confirm.js";
import { logError } from "@lumi/lib/utilities/errors.js";
import { mapWithConcurrency } from "@lumi/lib/utilities/concurrency.js";
import { isNullish } from "@lumi/shared";
import { Time } from "@lumi/shared";
import { Result, type Awaitable } from "@lumi/shared";
import type { Container } from "@lumi/lib/services.js";
import type { Guild, GuildMember, User } from "discord.js";
import type { CaseAction } from "@prisma/client";

const Root = "commands";

function targetIdOf(target: ModerationCommand.TargetLike): string {
  return typeof target === "string" ? target : target.id;
}

/**
 * The slice of {@linkcode CommandContext} {@linkcode checkHierarchy} needs -
 * satisfied by a real `CommandContext` and also by a lightweight adapter for
 * a flow that isn't a full command invocation (e.g. a context-menu command's
 * follow-up modal), so that flow enforces the same hierarchy boundary instead
 * of calling the punishment action directly.
 */
export interface HierarchyCheckContext {
  guild: Guild | null;
  member: GuildMember | null;
}

/** {@linkcode checkHierarchy}'s context plus what {@linkcode checkDuplicateCase} forwards into `confirmPrompt`. */
export interface DuplicateCaseCheckContext
  extends HierarchyCheckContext,
    ConfirmPromptContext {
  services: Container;
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

/**
 * While panic mode is active and `security:panic_lock_mod_commands` is on,
 * only the guild owner or whoever triggered panic mode may run moderation
 * commands - stops a compromised mod account from acting while the server is
 * locked down.
 */
async function checkPanicLock(
  ctx: CommandContext,
  t: LumiT,
): Promise<ModerationCommand.Reply | null> {
  const guild = ctx.guild;
  const moderator = ctx.member;
  if (!guild || !moderator) return null;
  if (guild.ownerId === moderator.id) return null;

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

/**
 * If a case matching `duplicateCaseAction` against this target was opened
 * within the guild's configured window, shows a confirmation prompt instead
 * of silently opening a second case. Returns `false` only when the prompt
 * was shown and the invoker declined - every other outcome (no duplicate, no
 * window configured, prompt confirmed) lets the run proceed.
 */
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

/**
 * Rejects a moderation action whose target outranks (or ties) the invoker.
 *
 * Discord's own hierarchy only protects the *bot* from acting above its top
 * role - without this, anyone holding a `mod.*` permit could use the bot to
 * act on admins and other moderators ranked above them.
 *
 * @returns the reply to fail with, or null when the action may proceed.
 */
export async function checkHierarchy(
  ctx: HierarchyCheckContext,
  target: ModerationCommand.TargetLike,
  t: LumiT,
): Promise<ModerationCommand.Reply | null> {
  const guild = ctx.guild;
  const moderator = ctx.member;
  if (!guild || !moderator) return null;
  if (guild.ownerId === moderator.id) return null;

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

/** How many mass-action targets may run concurrently. Sequential stays the default. */
const DefaultBatchConcurrency = 1;
/** Delay between starting batched Discord API mutations, so a 25-target run does not burst. */
const BatchStaggerMs = 250;

function rejectedLine<Target extends ModerationCommand.TargetLike>(
  entry: RejectedEntry<Target>,
): string {
  return `❌ <@${targetIdOf(entry.target)}> - ${entry.reply.body}`;
}

/**
 * Combines every target's outcome into one reply. A single clean success keeps
 * the flow's own success card verbatim (existing single-target callers see no
 * change); anything else - multiple targets, or any failure - renders as a
 * per-target checklist instead.
 */
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

/**
 * Drives a single moderation flow to completion and replies with its outcome.
 *
 * @remarks
 *
 * The call order below is part of the contract, not an implementation detail:
 * on the prefix path {@linkcode CommandContext} binds positional arguments in
 * the order the getters are called, so a hook that reads an extra option must
 * run in the slot the command's own option list puts it in.
 *
 * 1. Defer the reply, then resolve the guild's translator.
 * 2. {@linkcode ModerationCommand.Flow.resolveTarget}. A nullish or empty
 *    result ends the run with {@linkcode ModerationCommand.Flow.targetNotFound}.
 *    Returning an array runs every step below once per target and replies
 *    with one aggregated card instead of one reply per target.
 * 3. Per target: {@linkcode ModerationCommand.Flow.preHandle} - the slot for
 *    reading and validating options that sit between the target and the
 *    reason. An `Err` drops that target from the batch with that reply
 *    instead of ending the whole run.
 * 4. {@linkcode ModerationCommand.Flow.resolveReason}, which consumes the rest
 *    of a prefix invocation by default and so must run last - once, shared by
 *    every target in the batch.
 * 5. One confirmation prompt covering every surviving target.
 * 6. {@linkcode ModerationCommand.Flow.action} per target, wrapped in a
 *    `try`/`catch` only when the flow declares a `logScope`.
 * 7. {@linkcode ModerationCommand.Flow.buildSuccessMessage} per target,
 *    combined into the final reply.
 *
 * @param ctx - The invocation this flow replies to.
 * @param flow - The hooks describing the one action being taken.
 */
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

  // Last, because on a prefix invocation this consumes every remaining
  // argument: reading it before `preHandle` would swallow the options
  // `preHandle` still has to pick, such as a trailing duration.
  const reason = flow.resolveReason
    ? await flow.resolveReason(ctx, t)
    : await readReason(ctx, t);

  if (prepared.length === 0) {
    // A single rejection keeps its specific reply (e.g. the hierarchy-denial
    // title/body); more than one must go through the aggregated card below,
    // or every rejection past the first is silently dropped.
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
    // A batch of mass-action targets is staggered, not fired all at once, so
    // a 25-target `/ban` doesn't burst the guild's audit-log/ban rate limit.
    await mapWithConcurrency(prepared, DefaultBatchConcurrency, async (entry) => {
      await runOne(entry);
      await Bun.sleep(BatchStaggerMs);
    });
  }

  return replyBatchResult(ctx, t, flow, successes, rejected);
}

export namespace ModerationCommand {
  export type RunContext = CommandContext;

  /** Anything a flow can address and log a target id for. */
  export type TargetLike = string | { id: string };

  export interface Reply {
    title: string;
    body: string;
  }

  /** What the action and every hook downstream of it are handed. */
  export interface ActionContext<Target extends TargetLike, Prepared = null> {
    guild: Guild;
    target: Target;
    moderator: User;
    reason: string;
    /** The value {@linkcode ModerationCommand.Flow.preHandle} produced. */
    prepared: Prepared;
  }

  export interface OutcomeContext<
    Target extends TargetLike,
    Outcome,
    Prepared = null,
  > extends ActionContext<Target, Prepared> {
    /** Whatever {@linkcode ModerationCommand.Flow.action} returned. */
    outcome: Outcome;
  }

  /**
   * One moderation action expressed as hooks, so a subcommand group can hold
   * several flows side by side.
   */
  export interface Flow<Target extends TargetLike, Outcome, Prepared = null> {
    logScope?: string;
    /** The case `action` string this flow's duplicate-case window check matches against (e.g. "kick", "warn"). Omit to skip the check. */
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
