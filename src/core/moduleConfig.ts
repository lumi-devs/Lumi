import type { ModuleConfigService } from "@lumi/module-kit";

interface ModuleConfigOptions {
  config: {
    get(guildId: string, key: string): Promise<unknown>;
    set(guildId: string, key: string, value: unknown): Promise<void>;
  };
}

export function createModuleConfigService(
  options: ModuleConfigOptions,
): ModuleConfigService {
  const { config } = options;

  return {
    async read(guildId, moduleName, key = moduleName): Promise<unknown> {
      return config.get(guildId, key);
    },

    async save(guildId, _moduleName, key, value): Promise<void> {
      await config.set(guildId, key, value);
    },
  };
}
