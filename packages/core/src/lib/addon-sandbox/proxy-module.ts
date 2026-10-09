import type { Container } from "#lib/services.js";
import {
  defineModule,
  type ModuleObject,
} from "#lib/module-system/Module.js";
import type { ModuleMeta } from "#lib/module-system/meta.js";
import { scanKeysSafe } from "@lumi/infrastructure/database";

// Swept host-side rather than asked of the addon, so it works while the addon
// is crashed, disabled or uninstalled. Only data keyed to the user is matched;
// a user id inside another row's value stays, since that row is shared.
async function forgetValkeyMember(
  services: Container,
  name: string,
  userId: string,
): Promise<number> {
  const keys = await scanKeysSafe(services.valkey, `lumi:addon:${name}:*`);
  if (keys.length === 0) return 0;

  const pipeline = services.valkey.pipeline();
  for (const key of keys) pipeline.srem(key, userId);
  const results = await pipeline.exec();

  // A non-set key answers WRONGTYPE rather than failing the pipeline.
  return (results ?? []).filter(([err, removed]) => !err && removed === 1)
    .length;
}

export function createProxyModule(
  name: string,
  dir: string,
  meta: ModuleMeta,
): ModuleObject {
  return {
    ...defineModule({
      ...meta,
      name,
      deleteUserData: async (services: Container, userId: string): Promise<void> => {
        const rows = await services.db.guildKV.deleteModuleDataForTarget(
          name,
          userId,
        );
        const members = await forgetValkeyMember(services, name, userId);
        services.logger.info(
          `[GDPR] Addon '${name}': removed ${rows} KV row(s) and ${members} Valkey membership(s) for ${userId}`,
        );
      },
      exportUserData: async (
        services: Container,
        userId: string,
      ): Promise<Record<string, unknown> | null> => {
        const rows =
          await services.db.guildKV.listModuleDataForTarget(name, userId);
        return rows.length > 0 ? { moduleData: rows } : null;
      },
    }),
    dir,
  };
}
