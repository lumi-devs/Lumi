import { logger } from "@lumi/foundation";
import { requireGuildId } from "#lib/server/auth.js";
import { fetchBotGuild, fetchBotUser } from "#lib/server/discord.js";
import { moduleCatalog } from "#lib/server/modules.js";
import { getPrisma } from "#lib/server/prisma.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const guildId = await requireGuildId(event);
  const prisma = getPrisma();

  const [
    permitCount,
    openTickets,
    recentAudit,
    latestSnapshot,
    latestBackup,
    catalog,
  ] = await Promise.all([
    prisma.permit.count({ where: { guildId } }),
    prisma.ticket.count({ where: { guildId, status: "open" } }),
    prisma.auditLog.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.statsSnapshot.findFirst({
      where: { guildId },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.securityBackup.findFirst({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      select: { id: true, reason: true, createdAt: true },
    }),
    moduleCatalog(guildId),
  ]);

  let botPresent = false;
  try {
    botPresent = Boolean(await fetchBotGuild(guildId));
  } catch (error) {
    logger.warn("[dashboard] bot guild lookup failed", error);
  }

  const userIds = Array.from(new Set(recentAudit.map((entry) => entry.userId)));
  const userNames = new Map(
    await Promise.all(
      userIds.map(async (id) => {
        const user = await fetchBotUser(id).catch(() => null);
        return [id, user?.global_name || user?.username || null] as const;
      }),
    ),
  );

  const bundled = catalog?.filter((module) => !module.isAddon) ?? [];
  const enabledModules = bundled.filter((module) => module.enabled).length;

  return {
    botPresent,
    modules: catalog
      ? { enabled: enabledModules, available: bundled.length }
      : null,
    permitCount,
    openTickets,
    memberCount: latestSnapshot?.memberCount ?? null,
    snapshotAt: latestSnapshot?.capturedAt.toISOString() ?? null,
    latestBackup: latestBackup
      ? {
          id: latestBackup.id,
          reason: latestBackup.reason,
          createdAt: latestBackup.createdAt.toISOString(),
        }
      : null,
    recentAudit: recentAudit.map((entry) => ({
      id: entry.id,
      action: entry.action,
      userId: entry.userId,
      userName: userNames.get(entry.userId) ?? null,
      targetId: entry.targetId,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
};
