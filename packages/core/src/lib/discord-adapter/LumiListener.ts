import { Listener } from "@sapphire/framework";
import type { ClientEvents } from "discord.js";

export interface LumiListenerOptions extends Listener.Options {
  module?: string;
}

export abstract class LumiListener<E extends keyof ClientEvents | symbol = ""> extends Listener<
  E,
  LumiListenerOptions
> {
  public readonly module?: string;

  public constructor(context: Listener.LoaderContext, options?: LumiListenerOptions) {
    super(context, options);
    this.module = options?.module;
  }

  public get services() {
    return this.container;
  }
}

export namespace LumiListener {
  export type Options = LumiListenerOptions;
  export type LoaderContext = Listener.LoaderContext;
}
