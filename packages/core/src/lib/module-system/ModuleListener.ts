import { randomUUIDv7 } from "bun";
import { Listener } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import type { ClientEvents } from "discord.js";
import { runWithContext } from "@lumi/observability";
import { isModuleEnabled } from "#lib/utilities/misc.js";

export interface ModuleListenerOptions extends Listener.Options {
  /** Module whose enabled state gates this listener (checked per event). */
  module: string;
}

/** Base class for module-owned gateway listeners. */
export abstract class ModuleListener<
  E extends keyof ClientEvents = keyof ClientEvents,
> extends Listener {
  readonly #module: string;

  public constructor(
    context: Listener.LoaderContext,
    options: ModuleListenerOptions,
  ) {
    super(context, options);
    this.#module = options.module;
  }

  public get module(): string {
    return this.#module;
  }

  public async run(...args: ClientEvents[E]): Promise<void> {
    const guildId = this.resolveGuildId(...args);
    if (!guildId) return;
    return runWithContext(
      {
        correlationId: randomUUIDv7(),
        source: "event",
        name: this.name,
        guildId,
      },
      async () => {
        if (!(await isModuleEnabled(guildId, this.#module))) return;
        await this.handle(...args);
      },
    );
  }

  /** Resolves the guild ID from the event arguments. */
  protected resolveGuildId(...args: ClientEvents[E]): string | null {
    const [first] = args as [
      { guildId?: string | null; guild?: { id: string } | null } | undefined,
    ];
    return first?.guildId ?? first?.guild?.id ?? null;
  }

  protected abstract handle(...args: ClientEvents[E]): Awaitable<void>;
}

export namespace ModuleListener {
  export type Options = ModuleListenerOptions;
}
