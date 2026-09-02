import { BaseCommand, type CommandContext } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { confirmPrompt, type ConfirmPromptOptions } from "#lib/utilities/confirm.js";
import { logError } from "#lib/utilities/errors.js";
import { Emojis } from "#lib/utilities/assets.js";
import { isNullish } from "@sapphire/utilities";
import { Result, container, type Awaitable } from "@sapphire/framework";
import type { Guild, GuildMember, User } from "discord.js";

const Root = LanguageKeys.Commands;

function targetIdOf(target: ModerationCommand.TargetLike): string {
  return typeof target === "string" ? target : target.id;
}

async function readReason(ctx: CommandContext, t: LumiT): Promise<string> {
  return (await ctx.getString("reason", { rest: true })) ?? t(Root.ModNoReason);
}

function replyFailure(
  ctx: CommandContext,
  reply: ModerationCommand.Reply,
): Promise<void> {
  return ctx.replyError(reply.title, reply.body);
}

function memberNotFound(t: LumiT): ModerationCommand.Reply {
  return {
    title: t(Root.ModMemberNotFoundTitle),
    body: t(Root.ModMemberNotFound),
  };
}

function actionFailed(t: LumiT): ModerationCommand.Reply {
  return {
    title: t(Root.ModActionFailedTitle),
    body: t(Root.ModActionFailed),
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

  const locked = await container.db.config.getModuleConfig(
    guild.id,
    "security",
    "panic_lock_mod_commands",
  );
  if (locked !== true) return null;

  const state = await container.db.security.getPanicState(guild.id);
  if (!state) return null;
  if (state.actorId === moderator.id) return null;

  return {
    title: t(Root.ModPanicLockedTitle),
    body: t(Root.ModPanicLocked),
  };
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
async function checkHierarchy(
  ctx: CommandContext,
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
    title: t(Root.ModHierarchyTitle),
    body: t(Root.ModHierarchy, { user }),
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
 * 2. {@linkcode ModerationCommand.Flow.resolveTarget}. A nullish target ends
 *    the run with {@linkcode ModerationCommand.Flow.targetNotFound}.
 * 3. {@linkcode ModerationCommand.Flow.preHandle} - the slot for reading and
 *    validating options that sit between the target and the reason. An `Err`
 *    ends the run with that reply.
 * 4. {@linkcode ModerationCommand.Flow.resolveReason}, which consumes the rest
 *    of a prefix invocation by default and so must run last.
 * 5. {@linkcode ModerationCommand.Flow.action}, wrapped in a `try`/`catch` only
 *    when the flow declares a `logScope`.
 * 6. {@linkcode ModerationCommand.Flow.buildSuccessMessage}.
 *
 * @param ctx - The invocation this flow replies to.
 * @param flow - The hooks describing the one action being taken.
 */
interface PreparedEntry<Target, Prepared> {
  target: Target;
  prepared: Prepared;
}

interface RejectedEntry<Target> {
  target: Target;
  reply: ModerationCommand.Reply;
}

/** Builds one line of the batch-result card for a target that didn't make it through. */
function rejectedLine<Target extends ModerationCommand.TargetLike>(
  entry: RejectedEntry<Target>,
): string {
  return `${Emojis.CROSS} <@${targetIdOf(entry.target)}> - ${entry.reply.body}`;
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
      return `${Emojis.CHECK} <@${targetIdOf(outcomeContext.target)}> - ${success.body}`;
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

  const reason = flow.resolveReason
    ? await flow.resolveReason(ctx, t)
    : await readReason(ctx, t);

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
      rejected.push({ target, reply: result.unwrapErr() });
      continue;
    }

    prepared.push({ target, prepared: result.unwrap() });
  }

  if (prepared.length === 0) {
    return replyFailure(ctx, rejected[0]!.reply);
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

  for (const { target, prepared: preparedValue } of prepared) {
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
      continue;
    }

    try {
      const outcome = await flow.action(context);
      successes.push({ ...context, outcome });
    } catch (error: unknown) {
      const expected = flow.mapExpectedError?.(t, error, context) ?? null;
      if (expected) {
        rejected.push({ target, reply: expected });
        continue;
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
  }

  return replyBatchResult(ctx, t, flow, successes, rejected);
}

/**
 * A standalone command that applies one moderation action to one target.
 *
 * @remarks
 *
 * Subclasses declare only what is unique to their action - the target, the
 * call into `modules/mod/actions`, and the success card - while
 * {@linkcode runModerationFlow} owns the deferral, the translator, the
 * not-found reply, the reason, the failure log and the reply itself. Read that
 * function's remarks for the exact call order; overriding a hook never changes
 * it.
 *
 * A subcommand group whose entries each apply a different action extends
 * `ModerationSubcommand` and passes a {@linkcode ModerationCommand.Flow} per
 * entry instead.
 */
export abstract class ModerationCommand<
  Target extends ModerationCommand.TargetLike,
  Outcome,
  Prepared = null,
> extends BaseCommand {
  /**
   * Scope prefix for the failure log, e.g. `timeout add`. Declaring it also
   * opts the command into the `try`/`catch` around the action; without it an
   * action error propagates to the framework's error handler untouched.
   */
  protected readonly logScope: string | undefined;

  public constructor(
    context: ModerationCommand.LoaderContext,
    options: ModerationCommand.Options,
  ) {
    super(context, options);
    this.logScope = options.logScope;
  }

  public override run(ctx: CommandContext): Promise<void> {
    return runModerationFlow(ctx, this.#flow());
  }

  /**
   * Resolves the member(s), user(s) or raw user id(s) the action applies to.
   * A nullish or empty result ends the run with
   * {@linkcode ModerationCommand.targetNotFound}; an array runs the rest of
   * the flow once per target and replies with one aggregated card.
   */
  protected abstract resolveTarget(
    ctx: CommandContext,
    t: LumiT,
  ): Awaitable<Target | Target[] | null>;

  /** Applies the action, usually by delegating to `modules/mod/actions`. */
  protected abstract action(
    context: ModerationCommand.ActionContext<Target, Prepared>,
  ): Promise<Outcome>;

  /** Builds the card shown once the action has been applied. */
  protected abstract buildSuccessMessage(
    t: LumiT,
    context: ModerationCommand.OutcomeContext<Target, Outcome, Prepared>,
  ): ModerationCommand.Reply;

  /** The card shown when {@linkcode ModerationCommand.resolveTarget} yields nothing. */
  protected targetNotFound(t: LumiT): ModerationCommand.Reply {
    return memberNotFound(t);
  }

  /**
   * Reads and validates the options sitting between the target and the reason,
   * producing the value carried as `prepared` for the rest of the run. Return
   * an `Err` to end the run with that reply instead of taking the action.
   */
  protected preHandle(
    ctx: CommandContext,
    t: LumiT,
    target: Target,
  ): Awaitable<Result<Prepared, ModerationCommand.Reply>>;

  protected preHandle() {
    return Result.ok(null as Prepared);
  }

  /** Reads the audit-log reason, falling back to the localized placeholder. */
  protected resolveReason(ctx: CommandContext, t: LumiT): Awaitable<string> {
    return readReason(ctx, t);
  }

  /**
   * Translates a failure the action raises as control flow - a sentinel the
   * action layer throws rather than a fault - into its own card. Returning a
   * reply also suppresses the failure log; return `null` to treat the error as
   * unexpected.
   */
  protected mapExpectedError(
    t: LumiT,
    error: unknown,
    context: ModerationCommand.ActionContext<Target, Prepared>,
  ): ModerationCommand.Reply | null;

  protected mapExpectedError(): ModerationCommand.Reply | null {
    return null;
  }

  /**
   * Optionally returns options for a confirmation prompt shown before the action.
   * Return null/undefined to skip confirmation.
   */
  protected confirm(
    _t: LumiT,
    _context: ModerationCommand.ActionContext<Target, Prepared>,
  ): Awaitable<ConfirmPromptOptions | null | undefined> {
    return null;
  }

  /** The card shown when the action fails for an unexpected reason. */
  protected buildFailureMessage(
    t: LumiT,
    _context: ModerationCommand.ActionContext<Target, Prepared>,
  ): ModerationCommand.Reply {
    return actionFailed(t);
  }

  #flow(): ModerationCommand.Flow<Target, Outcome, Prepared> {
    return {
      logScope: this.logScope,
      resolveTarget: (ctx, t) => this.resolveTarget(ctx, t),
      targetNotFound: (t) => this.targetNotFound(t),
      preHandle: (ctx, t, target) => this.preHandle(ctx, t, target),
      resolveReason: (ctx, t) => this.resolveReason(ctx, t),
      confirm: (t, context) => this.confirm(t, context),
      action: (context) => this.action(context),
      mapExpectedError: (t, error, context) =>
        this.mapExpectedError(t, error, context),
      buildFailureMessage: (t, context) => this.buildFailureMessage(t, context),
      buildSuccessMessage: (t, context) => this.buildSuccessMessage(t, context),
    };
  }
}

export namespace ModerationCommand {
  export type Options = BaseCommand.Options & {
    /** See {@linkcode ModerationCommand.logScope}. */
    logScope?: string;
  };
  export type LoaderContext = BaseCommand.LoaderContext;
  export type Registry = BaseCommand.Registry;
  export type RunContext = CommandContext;

  /** Anything a flow can address and log a target id for. */
  export type TargetLike = string | { id: string };

  /** The title and body of one moderation card. */
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
   * several. {@linkcode ModerationCommand} implements this interface through
   * its own protected members; the docs live there.
   */
  export interface Flow<Target extends TargetLike, Outcome, Prepared = null> {
    logScope?: string;
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
