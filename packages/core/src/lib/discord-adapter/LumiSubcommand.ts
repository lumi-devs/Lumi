import { Subcommand } from "@sapphire/plugin-subcommands";

export interface LumiSubcommandOptions extends Subcommand.Options {
  module?: string;
  requiredPermit?: string;
}

export abstract class LumiSubcommand extends Subcommand {
  public readonly requiredPermit?: string;
  public readonly module?: string;

  public constructor(context: Subcommand.LoaderContext, options: LumiSubcommandOptions) {
    super(context, options);
    this.requiredPermit = options.requiredPermit;
    this.module = options.module;
  }

  public get services() {
    return this.container;
  }

  protected override parseConstructorPreConditions(options: LumiSubcommandOptions): void {
    super.parseConstructorPreConditions(options);
    if (options.requiredPermit) {
      this.preconditions.append("LumiPermission");
    }
  }
}

export namespace LumiSubcommand {
  export type Options = LumiSubcommandOptions;
  export type LoaderContext = Subcommand.LoaderContext;
  export type Registry = Subcommand.Registry;
}
