import type { Listener } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import { LumiEvents, type GuildMessage } from "#lib/types/common.js";
import { ModuleListener } from "./ModuleListener.js";

/** Specialization of ModuleListener for user messages in guilds. */
export abstract class GuildMessageListener extends ModuleListener<
  typeof LumiEvents.GuildUserMessage
> {
  public constructor(
    context: Listener.LoaderContext,
    options: ModuleListener.Options,
  ) {
    super(context, { ...options, event: LumiEvents.GuildUserMessage });
  }

  protected abstract override handle(message: GuildMessage): Awaitable<void>;
}

export namespace GuildMessageListener {
  export type Options = ModuleListener.Options;
}
