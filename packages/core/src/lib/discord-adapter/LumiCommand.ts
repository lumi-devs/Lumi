import { Command } from "@sapphire/framework";

export interface LumiCommandOptions extends Command.Options {
  module?: string;
  requiredPermit?: string;
}

export abstract class LumiCommand extends Command {
  public readonly requiredPermit?: string;
  public readonly module?: string;

  public constructor(context: Command.LoaderContext, options: LumiCommandOptions) {
    super(context, options);
    this.requiredPermit = options.requiredPermit;
    this.module = options.module;
  }

  public get services() {
    return this.container;
  }

  protected override parseConstructorPreConditions(options: LumiCommandOptions): void {
    super.parseConstructorPreConditions(options);
    if (options.requiredPermit) {
      this.preconditions.append("LumiPermission");
    }
  }
}

export namespace LumiCommand {
  export type Options = LumiCommandOptions;
  export type LoaderContext = Command.LoaderContext;
  export type Registry = Command.Registry;
}
