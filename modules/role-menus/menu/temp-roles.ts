import type { ModuleServices, TaskDefinition } from "@lumi/module-kit";
import { fetchMember } from "./service.js";

interface TempRoleRow {
  readonly id: string;
  readonly guildId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly expiresAt: Date;
}

async function sweepGuild(services: ModuleServices, now: Date): Promise<void> {
  let rows: TempRoleRow[];
  try {
    rows = await services.db.prisma.roleMenuTempRole.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: 100,
    });
  } catch (error) {
    services.observability?.logger?.warn?.("role menu temp role sweep failed", {
      error,
    });
    return;
  }

  for (const row of rows) {
    const claimed = await services.db.prisma.roleMenuTempRole
      .deleteMany({
        where: { id: row.id, expiresAt: { lte: now } },
      })
      .catch(() => ({ count: 0 }));
    if (claimed.count === 0) continue;

    const guild =
      services.client.guilds.cache.get(row.guildId) ??
      (await services.client.guilds.fetch(row.guildId).catch(() => null));
    if (!guild) continue;

    const member = await fetchMember(guild, row.userId);
    if (!member) continue;
    if (!member.roles.cache.has(row.roleId)) continue;

    await member.roles
      .remove(row.roleId, "Temporary role menu expired")
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.(
          "role menu temp role removal failed",
          {
            guildId: row.guildId,
            userId: row.userId,
            roleId: row.roleId,
            error,
          },
        );
      });
  }
}

export const tempRoleSweep: TaskDefinition = {
  name: "temp-role-sweep",
  cron: "*/1 * * * *",
  async handler(services) {
    await sweepGuild(services, new Date());
  },
};
