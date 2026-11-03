import type { ModuleConfigService } from "@lumi/module-kit";
import type { ModuleLoader } from "@lumi/module-runtime";

const ConfigVersionsKey = "__moduleConfigVersions";

interface ModuleConfigOptions {
  loader: Pick<ModuleLoader, "getModule">;
  config: {
    get(guildId: string, key: string): Promise<unknown>;
    set(guildId: string, key: string, value: unknown): Promise<void>;
    update(
      guildId: string,
      key: string,
      updater: (value: unknown) => unknown,
    ): Promise<unknown>;
  };
}

function versionMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const versions: Record<string, number> = {};
  for (const [key, version] of Object.entries(value)) {
    if (typeof version === "number" && Number.isInteger(version)) {
      versions[key] = version;
    }
  }
  return versions;
}

export function createModuleConfigService(
  options: ModuleConfigOptions,
): ModuleConfigService {
  const { loader, config } = options;

  return {
    async read(guildId, moduleName, key = moduleName): Promise<unknown> {
      const definition = loader.getModule(moduleName)?.definition;
      const target = definition?.configVersion ?? 1;
      const current =
        versionMap(await config.get(guildId, ConfigVersionsKey))[moduleName] ??
        1;
      let value = await config.get(guildId, key);
      if (target <= current) return value;

      for (let version = current; version < target; version++) {
        const migration = definition?.configMigrations?.[version];
        if (!migration) {
          throw new Error(
            `Module "${moduleName}" has no config migration from version ${version}.`,
          );
        }
        value = migration(value);
      }

      await config.set(guildId, key, value);
      await config.update(guildId, ConfigVersionsKey, (stored) => ({
        ...versionMap(stored),
        [moduleName]: target,
      }));
      return value;
    },

    async save(guildId, moduleName, key, value): Promise<void> {
      await config.set(guildId, key, value);
      const target =
        loader.getModule(moduleName)?.definition.configVersion ?? 1;
      if (target <= 1) return;
      await config.update(guildId, ConfigVersionsKey, (stored) => {
        const versions = versionMap(stored);
        return {
          ...versions,
          [moduleName]: Math.max(versions[moduleName] ?? 1, target),
        };
      });
    },
  };
}
