import { container, type Command } from "@sapphire/framework";
import type { AddonCommandDescriptor } from "@lumi/contracts";
import { BaseCommand } from "#lib/commands.js";
import type { CommandContext } from "#lib/command-context.js";
import type { AddonHost } from "./AddonHost.js";

interface ProxyOptions extends BaseCommand.Options {
  host: AddonHost;
  moduleName: string;
  builder: Record<string, unknown> | null;
}

class ProxyCommand extends BaseCommand {
  readonly #host: AddonHost;
  readonly #moduleName: string;
  readonly #builder: Record<string, unknown> | null;

  public constructor(context: Command.LoaderContext, options: ProxyOptions) {
    super(context, options);
    this.#host = options.host;
    this.#moduleName = options.moduleName;
    this.#builder = options.builder;
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    if (this.#builder) registry.registerChatInputCommand(this.#builder as never);
  }

  public override run(ctx: CommandContext) {
    return this.#host.invokeCommand(this.#moduleName, this.name, ctx);
  }
}

export function registerProxyCommands(
  host: AddonHost,
  moduleName: string,
  moduleDir: string,
  descriptors: AddonCommandDescriptor[],
): void {
  const store = container.stores.get("commands");
  unregisterProxyCommands(moduleDir);

  for (const descriptor of descriptors) {
    const piece = new ProxyCommand(
      { name: descriptor.name, path: moduleDir, root: moduleDir, store },
      {
        name: descriptor.name,
        description: descriptor.description,
        host,
        moduleName,
        builder: descriptor.builder,
      },
    );
    store.set(descriptor.name, piece);
  }
}

export function unregisterProxyCommands(moduleDir: string): void {
  const store = container.stores.get("commands");
  for (const [name, piece] of [...store.entries()]) {
    if (piece.location.root === moduleDir) store.delete(name);
  }
}
