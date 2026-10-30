import type { PageServerLoad } from "./$types";
import { requireGuildAccess } from "$lib/server/auth";
import { fetchBotGuild } from "$lib/server/discord";
import { moduleCatalog } from "$lib/server/modules";
import { getPrisma } from "$lib/server/prisma";

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const prisma = getPrisma();

  const [
    enabledModules,
    permitCount,
    openTickets,
    recentAudit,
    latestSnapshot,
    latestBackup,
    catalog,
  ] = await Promise.all([
    prisma.guildModule.count({ where: { guildId, enabled: true } }),
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
    moduleCatalog(),
  ]);

  let botPresent = false;
  try {
    botPresent = Boolean(await fetchBotGuild(guildId));
  } catch (error) {
    console.warn("[dashboard] bot guild lookup failed", error);
  }

  return {
    botPresent,
    modules: {
      enabled: enabledModules,
      available: catalog.length,
    },
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
      targetId: entry.targetId,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
};
