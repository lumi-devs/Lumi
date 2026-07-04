import type { Listener } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import { LumiEvents, type GuildMessage } from "#lib/types.js";
import { ModuleListener } from "./ModuleListener.js";

/**
 * ModuleListener specialization for user messages in guilds. Subscribes to
 * the router-emitted `GuildUserMessage` event, so webhook/system/bot/DM
 * messages are already filtered out (see core/listeners/routing).
 */
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
