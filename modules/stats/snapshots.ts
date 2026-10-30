import type { Client, Guild, GuildMember } from "discord.js";
import { SnapshotIntervalMinutes, StatsModuleName } from "./constants.js";
import { bucketStart } from "./ranges.js";

interface SnapshotServices {
  client: Client;
  modules: { isEnabled(guildId: string, moduleName: string): boolean };
  db: { prisma: any };
}

export interface SnapshotCounts {
  memberCount: number;
  onlineCount: number;
  idleCount: number;
  dndCount: number;
  offlineCount: number;
  voiceCount: number;
  channelCount: number;
  roleCount: number;
  boostCount: number;
  boostTier: number;
}

export function countGuildSnapshot(guild: Guild): SnapshotCounts {
  let online = 0;
  let idle = 0;
  let dnd = 0;
  let offlineCached = 0;
  let voice = 0;

  for (const member of guild.members.cache.values()) {
    if (!member.user.bot && member.voice.channelId) voice++;
    switch (member.presence?.status) {
      case "online":
        online++;
        break;
      case "idle":
        idle++;
        break;
      case "dnd":
        dnd++;
        break;
      default:
        offlineCached++;
        break;
    }
  }

  const memberCount = guild.memberCount;
  const offline =
    guild.members.cache.size > 0 && guild.members.cache.size < memberCount
      ? Math.max(offlineCached, memberCount - online - idle - dnd)
      : offlineCached;

  return {
    memberCount,
    onlineCount: online,
    idleCount: idle,
    dndCount: dnd,
    offlineCount: Math.max(0, offline),
    voiceCount: voice,
    channelCount: guild.channels.cache.size,
    roleCount: guild.roles.cache.size,
    boostCount: guild.premiumSubscriptionCount ?? 0,
    boostTier: Number(guild.premiumTier ?? 0),
  };
}

export async function captureGuildSnapshot(
  services: SnapshotServices,
  guild: Guild,
  now: Date = new Date(),
): Promise<void> {
  const capturedAt = bucketStart(now, SnapshotIntervalMinutes);
  const counts = countGuildSnapshot(guild);
  await services.db.prisma.statsSnapshot.upsert({
    where: { guildId_capturedAt: { guildId: guild.id, capturedAt } },
    create: { guildId: guild.id, capturedAt, ...counts },
    update: counts,
  });
}

export async function captureAllSnapshots(
  services: SnapshotServices,
  now: Date = new Date(),
): Promise<number> {
  let captured = 0;
  for (const guild of services.client.guilds.cache.values()) {
    if (!services.modules.isEnabled(guild.id, StatsModuleName)) continue;
    try {
      await captureGuildSnapshot(services, guild, now);
      captured++;
    } catch (error) {
      const logger = (
        services as {
          observability?: {
            logger?: { warn?: (msg: string, meta?: unknown) => void };
          };
        }
      ).observability?.logger;
      logger?.warn?.("[stats] snapshot failed", { guildId: guild.id, error });
    }
  }
  return captured;
}

export function memberPresence(member: GuildMember): string {
  const status = member.presence?.status;
  if (status === "online" || status === "idle" || status === "dnd") {
    return status;
  }
  return "offline";
}
