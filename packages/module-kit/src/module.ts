import type { z } from "zod";
import type { CommandDef } from "./command.ts";
import type { ListenerDef } from "./listener.ts";
import type { LumiServices } from "./services.ts";

export type ModuleConfigSchema = z.ZodObject<z.ZodRawShape>;

export type ModuleConfigFieldType =
  | "boolean"
  | "number"
  | "string"
  | "channel"
  | "role"
  | "multi-channel"
  | "multi-role";

/**
 * Display metadata for one key in a module's Zod config. Zod validates the
 * value; this metadata tells the control panel which control to render and how
 * to label it. Keep it next to the schema so the two cannot drift far apart.
 */
export interface ModuleConfigField {
  readonly key: string;
  readonly label: string;
  readonly type: ModuleConfigFieldType;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export interface ModuleDefinition<TConfig extends ModuleConfigSchema = ModuleConfigSchema> {
  readonly name: string;
  readonly displayName: string;
  readonly emoji: string;
  readonly description: string;
  readonly config: TConfig;
  readonly configFields?: readonly ModuleConfigField[];
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
