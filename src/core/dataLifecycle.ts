import { errorMessage } from "@lumi/foundation";
import type { UserDataDeletionResult } from "@lumi/module-kit";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { BotServices } from "./contracts.js";
import { servicesForModule } from "./modules.js";

export interface UserDataFailure {
  module: string;
  error: string;
}

export interface UserDataExport {
  guildId: string;
  userId: string;
  exportedAt: string;
  modules: Record<string, unknown>;
  failures: UserDataFailure[];
}

export interface UserDataDeletion {
  guildId: string;
  userId: string;
  deleted: number;
  anonymised: number;
  modules: Record<string, UserDataDeletionResult | null>;
  failures: UserDataFailure[];
}

export interface DataLifecycleService {
  exportUserData(guildId: string, userId: string): Promise<UserDataExport>;
  deleteUserData(guildId: string, userId: string): Promise<UserDataDeletion>;
}

interface DataLifecycleOptions {
  loader: Pick<ModuleLoader, "listAll">;
  services: BotServices;
}

export function createDataLifecycleService(
  options: DataLifecycleOptions,
): DataLifecycleService {
  const { loader, services } = options;

  return {
    async exportUserData(guildId, userId): Promise<UserDataExport> {
      const modules: Record<string, unknown> = {};
      const failures: UserDataFailure[] = [];

      for (const module of loader.listAll()) {
        const hooks = module.definition.dataLifecycle;
        if (!hooks?.exportUserData) continue;
        const name = module.manifest.name;
        try {
          modules[name] = await hooks.exportUserData(
            servicesForModule(services, name),
            guildId,
            userId,
          );
        } catch (error) {
          failures.push({
            module: name,
            error: errorMessage(error),
          });
        }
      }

      return {
        guildId,
        userId,
        exportedAt: new Date().toISOString(),
        modules,
        failures,
      };
    },

    async deleteUserData(guildId, userId): Promise<UserDataDeletion> {
      const modules: Record<string, UserDataDeletionResult | null> = {};
      const failures: UserDataFailure[] = [];
      let deleted = 0;
      let anonymised = 0;

      for (const module of loader.listAll()) {
        const hooks = module.definition.dataLifecycle;
        if (!hooks?.deleteUserData) continue;
        const name = module.manifest.name;
        try {
          const result = await hooks.deleteUserData(
            servicesForModule(services, name),
            guildId,
            userId,
          );
          modules[name] = result ?? null;
          deleted += result?.deleted ?? 0;
          anonymised += result?.anonymised ?? 0;
        } catch (error) {
          failures.push({
            module: name,
            error: errorMessage(error),
          });
        }
      }

      return {
        guildId,
        userId,
        deleted,
        anonymised,
        modules,
        failures,
      };
    },
  };
}
