import { Precondition } from "@sapphire/framework";

export interface LumiPreconditionOptions extends Precondition.Options {
  module?: string;
}

export abstract class LumiPrecondition<
  Options extends LumiPreconditionOptions = LumiPreconditionOptions,
> extends Precondition<Options> {
  public readonly module?: string;

  public constructor(context: Precondition.LoaderContext, options?: Options) {
    super(context, options);
    this.module = options?.module;
  }

  public get services() {
    return this.container;
  }
}

export namespace LumiPrecondition {
  export type Options = LumiPreconditionOptions;
  export type LoaderContext = Precondition.LoaderContext;
}
