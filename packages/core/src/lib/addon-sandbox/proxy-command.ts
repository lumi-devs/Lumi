import type { AddonCommandDescriptor } from "@lumi/contracts";
import type { CommandContext } from "#lib/commands/context.js";
import {
  commandRegistry,
  registerCommandDef,
  type CommandBuilder,
  type CommandDef,
} from "#lib/commands/command-def.js";
import type { AddonHost } from "./AddonHost.js";

const proxyNames = new Map<string, string[]>();

export function registerProxyCommands(
  host: AddonHost,
  moduleName: string,
  moduleDir: string,
  descriptors: AddonCommandDescriptor[],
): void {
  unregisterProxyCommands(moduleDir);

  const names: string[] = [];
  for (const descriptor of descriptors) {
    const name = descriptor.name;
    const def: CommandDef = {
      name,
      module: moduleName,
      description: descriptor.description,
      build: () => descriptor.builder as unknown as CommandBuilder,
      run: (ctx: CommandContext) =>
        host.invokeCommand(moduleName, name, ctx),
    };
    registerCommandDef(def);
    names.push(name);
  }
  proxyNames.set(moduleDir, names);
}

export function unregisterProxyCommands(moduleDir: string): void {
  for (const name of proxyNames.get(moduleDir) ?? []) {
    commandRegistry.delete(name);
  }
  proxyNames.delete(moduleDir);
}
