import { Listener } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import { LumiEvents, type GuildMessage } from "#lib/types.js";
import { isModuleEnabled } from "#utilities/listeners.js";

export interface GuildMessageListenerOptions extends Listener.Options {
  module: string;
}

export abstract class GuildMessageListener extends Listener {
  readonly #module: string;

  public constructor(
    context: Listener.LoaderContext,
    options: GuildMessageListenerOptions,
  ) {
    super(context, { ...options, event: LumiEvents.GuildUserMessage });
    this.#module = options.module;
  }

  public async run(message: GuildMessage): Promise<void> {
    if (!(await isModuleEnabled(message.guildId, this.#module))) return;
    await this.handle(message);
  }

  protected abstract handle(message: GuildMessage): Awaitable<void>;
}

export namespace GuildMessageListener {
  export type Options = GuildMessageListenerOptions;
}
