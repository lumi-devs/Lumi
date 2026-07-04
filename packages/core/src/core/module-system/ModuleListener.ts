import { Listener } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import type { ClientEvents } from "discord.js";
import { isModuleEnabled } from "#utilities/listeners.js";

export interface ModuleListenerOptions extends Listener.Options {
  /** Module whose enabled state gates this listener (checked per event). */
  module: string;
}

/**
 * Base class for every module-owned gateway listener: resolves the guild from
 * the event payload, drops non-guild events, gates on the module being
 * enabled, then hands off to `handle()`. Extend this instead of raw
 * `Listener` inside `src/modules/**` — the only sanctioned exception is a
 * listener that must run while its module is disabled (e.g. tempvc cleanup).
 */
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
    if (!(await isModuleEnabled(guildId, this.#module))) return;
    await this.handle(...args);
  }

  /**
   * Reads `guildId` / `guild.id` off the first event argument — covers
   * Message, GuildMember, GuildBan, VoiceState and their partials. Override
   * for events whose payload carries the guild elsewhere.
   */
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
