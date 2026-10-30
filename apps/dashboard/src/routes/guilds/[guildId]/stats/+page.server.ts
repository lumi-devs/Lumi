import type { PageServerLoad } from "./$types";
import { requireGuildAccess } from "$lib/server/auth";
import { getPrisma } from "$lib/server/prisma";

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const prisma = getPrisma();
  const since = new Date(Date.now() - 7 * 86_400_000);

  const [
    latest,
    snapshots,
    events,
    messageSum,
    voiceSum,
    economyUsers,
    economyTotal,
    levelingUsers,
  ] = await Promise.all([
    prisma.statsSnapshot.findFirst({
      where: { guildId },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.statsSnapshot.findMany({
      where: { guildId },
      orderBy: { capturedAt: "desc" },
      take: 14,
    }),
    prisma.statsEvent.groupBy({
      by: ["type"],
      where: { guildId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.statsMessageBucket.aggregate({
      where: { guildId, bucketStart: { gte: since } },
      _sum: { count: true },
    }),
    prisma.statsVoiceBucket.aggregate({
      where: { guildId, bucketStart: { gte: since } },
      _sum: { seconds: true },
    }),
    prisma.economyUser.count({ where: { guildId } }),
    prisma.economyUser.aggregate({
      where: { guildId },
      _sum: { balance: true, bankBalance: true },
    }),
    prisma.levelingUser.count({ where: { guildId } }),
  ]);

  return {
    latest: latest
      ? {
          capturedAt: latest.capturedAt.toISOString(),
          memberCount: latest.memberCount,
          onlineCount: latest.onlineCount,
          idleCount: latest.idleCount,
          dndCount: latest.dndCount,
          offlineCount: latest.offlineCount,
          voiceCount: latest.voiceCount,
          channelCount: latest.channelCount,
          roleCount: latest.roleCount,
          boostCount: latest.boostCount,
          boostTier: latest.boostTier,
        }
      : null,
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      capturedAt: snapshot.capturedAt.toISOString(),
      memberCount: snapshot.memberCount,
      onlineCount: snapshot.onlineCount,
      voiceCount: snapshot.voiceCount,
      channelCount: snapshot.channelCount,
      roleCount: snapshot.roleCount,
      boostCount: snapshot.boostCount,
    })),
    events: events
      .map((event) => ({ type: event.type, count: event._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    messages7d: messageSum._sum.count ?? 0,
    voiceMinutes7d: Math.round((voiceSum._sum.seconds ?? 0) / 60),
    economy: {
      users: economyUsers,
      balance: Number(economyTotal._sum.balance ?? 0n),
      bank: Number(economyTotal._sum.bankBalance ?? 0n),
    },
    levelingUsers,
  };
};
