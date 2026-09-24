import type { InteractionHandler } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import { BaseInteractionHandler, type AnyInteraction } from "#lib/interaction-handler.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";

export interface ModuleInteractionHandlerOptions extends InteractionHandler.Options {
  /** Module whose enabled state gates this handler (checked per interaction). */
  module: string;
}

export abstract class ModuleInteractionHandler<
  I extends AnyInteraction = AnyInteraction,
  T = unknown,
> extends BaseInteractionHandler {
  readonly #module: string;

  public constructor(
    context: InteractionHandler.LoaderContext,
    options: ModuleInteractionHandlerOptions,
  ) {
    super(context, options);
    this.#module = options.module;
  }

  public get module(): string {
    return this.#module;
  }

  public async run(interaction: I, parsed: T): Promise<void> {
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await isModuleEnabled(guildId, this.#module))) return;
    await this.handle(interaction, parsed);
  }

  protected abstract handle(interaction: I, parsed: T): Awaitable<void>;
}

export namespace ModuleInteractionHandler {
  export type Options = ModuleInteractionHandlerOptions;
}
