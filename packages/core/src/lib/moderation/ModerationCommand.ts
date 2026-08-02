import { BaseCommand, type CommandContext } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { logError } from "#lib/utilities/errors.js";
import { isNullish } from "@sapphire/utilities";
import { Result, type Awaitable } from "@sapphire/framework";
import type { Guild, User } from "discord.js";

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

  const target = await flow.resolveTarget(ctx, t);
  if (isNullish(target)) {
    return replyFailure(ctx, flow.targetNotFound?.(t) ?? memberNotFound(t));
  }

  const prepared: Result<Prepared, ModerationCommand.Reply> = flow.preHandle
    ? await flow.preHandle(ctx, t, target)
    : Result.ok(null as Prepared);
  if (prepared.isErr()) return replyFailure(ctx, prepared.unwrapErr());

  const reason = flow.resolveReason
    ? await flow.resolveReason(ctx, t)
    : await readReason(ctx, t);

  const context: ModerationCommand.ActionContext<Target, Prepared> = {
    guild: ctx.guild!,
    target,
    moderator: ctx.user,
    reason,
    prepared: prepared.unwrap(),
  };

  let outcome: Outcome;
  if (logScope === undefined) {
    outcome = await flow.action(context);
  } else {
    try {
      outcome = await flow.action(context);
    } catch (error: unknown) {
      const expected = flow.mapExpectedError?.(t, error, context) ?? null;
      if (expected) return replyFailure(ctx, expected);
      logError(
        `${logScope}: guild=${context.guild.id} target=${targetIdOf(context.target)}`,
        error,
      );
      return replyFailure(
        ctx,
        flow.buildFailureMessage?.(t, context) ?? actionFailed(t),
      );
    }
  }

  const success = flow.buildSuccessMessage(t, { ...context, outcome });
  return ctx.replySuccess(success.title, success.body);
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
   * Resolves the member, user or raw user id the action applies to. A nullish
   * result ends the run with {@linkcode ModerationCommand.targetNotFound}.
   */
  protected abstract resolveTarget(
    ctx: CommandContext,
    t: LumiT,
  ): Awaitable<Target | null>;

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
    resolveTarget(ctx: CommandContext, t: LumiT): Awaitable<Target | null>;
    targetNotFound?(t: LumiT): Reply;
    preHandle?(
      ctx: CommandContext,
      t: LumiT,
      target: Target,
    ): Awaitable<Result<Prepared, Reply>>;
    resolveReason?(ctx: CommandContext, t: LumiT): Awaitable<string>;
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
