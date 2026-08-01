import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import {
  runModerationFlow,
  type ModerationCommand,
} from "#lib/moderation/ModerationCommand.js";

/**
 * A subcommand group whose entries each apply a different moderation action.
 *
 * @remarks
 *
 * {@linkcode ModerationCommand} binds one flow to one piece, which a group like
 * `ban add` / `ban remove` cannot do. Entries here hand their own
 * {@linkcode ModerationCommand.Flow} to {@linkcode ModerationSubcommand.runFlow}
 * instead, and get the identical pipeline and call order.
 */
export abstract class ModerationSubcommand extends BaseSubcommand {
  /** Runs one entry's flow and replies with its outcome. */
  protected runFlow<
    Target extends ModerationCommand.TargetLike,
    Outcome,
    Prepared = null,
  >(
    ctx: CommandContext,
    flow: ModerationCommand.Flow<Target, Outcome, Prepared>,
  ): Promise<void> {
    return runModerationFlow(ctx, flow);
  }
}

export namespace ModerationSubcommand {
  export type Options = BaseSubcommand.Options;
  export type LoaderContext = BaseSubcommand.LoaderContext;
  export type Registry = BaseSubcommand.Registry;
  export type RunContext = CommandContext;
  export type Flow<
    Target extends ModerationCommand.TargetLike,
    Outcome,
    Prepared = null,
  > = ModerationCommand.Flow<Target, Outcome, Prepared>;
}
