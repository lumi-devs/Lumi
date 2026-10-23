import type { z } from "zod";
import type { CommandDef } from "./command.ts";
import type { ListenerDef } from "./listener.ts";
import type { LumiServices } from "./services.ts";

export type ModuleConfigSchema = z.ZodObject<z.ZodRawShape>;

export interface ModuleDefinition<TConfig extends ModuleConfigSchema = ModuleConfigSchema> {
  readonly name: string;
  readonly displayName: string;
  readonly emoji: string;
  readonly description: string;
  readonly config: TConfig;
  readonly commands?: readonly CommandDef[];
  readonly listeners?: readonly ListenerDef[];
  onLoad?(services: LumiServices): Promise<void> | void;
  onUnload?(services: LumiServices): Promise<void> | void;
}

export function defineModule<TConfig extends ModuleConfigSchema>(
  definition: ModuleDefinition<TConfig>,
): ModuleDefinition<TConfig> {
  return definition;
}

export type ModuleConfig<TModule extends ModuleDefinition> = z.infer<TModule["config"]>;

export function parseModuleConfig<TModule extends ModuleDefinition>(
  module: TModule,
  values: Record<string, unknown>,
): ModuleConfig<TModule> {
  return module.config.parse(values) as ModuleConfig<TModule>;
}
