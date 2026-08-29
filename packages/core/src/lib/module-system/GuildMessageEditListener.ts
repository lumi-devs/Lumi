import type { Listener } from "@sapphire/framework";
import type { Awaitable } from "@sapphire/utilities";
import { LumiEvents, type GuildMessage } from "#lib/types/common.js";
import { ModuleListener } from "./ModuleListener.js";

/** Specialization of ModuleListener for edits to user messages in guilds. */
export abstract class GuildMessageEditListener extends ModuleListener<
  typeof LumiEvents.GuildUserMessageEdit
> {
  public constructor(
    context: Listener.LoaderContext,
    options: ModuleListener.Options,
  ) {
    super(context, { ...options, event: LumiEvents.GuildUserMessageEdit });
  }

  protected abstract override handle(message: GuildMessage): Awaitable<void>;
}

export namespace GuildMessageEditListener {
  export type Options = ModuleListener.Options;
}
