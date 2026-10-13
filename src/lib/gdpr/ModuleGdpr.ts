import type { Container } from "#src/lib/Services.js";

export interface GuildKvRow {
  guildId: string;
  key: string;
  value: unknown;
}

export function moduleGdpr(
  module: string,
  key = "rows",
  mapRow: (row: GuildKvRow) => unknown = (row) => row.value,
) {
  return {
    async deleteUserData(services: Container, userId: string): Promise<void> {
      await services.db.guildKV.deleteModuleDataForTarget(module, userId);
    },

    async exportUserData(
      services: Container,
      userId: string,
    ): Promise<Record<string, unknown> | null> {
      const rows = await services.db.guildKV.listModuleDataForTarget(module, userId);
      if (rows.length === 0) return null;
      return { [key]: rows.map(mapRow) };
    },
  };
}
