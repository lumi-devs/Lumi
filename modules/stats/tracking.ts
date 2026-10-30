import type { GuildMember, Message, VoiceState } from "discord.js";
import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import {
  getStatsConfig,
  isIgnoredChannel,
  isIgnoredMember,
  type StatsConfig,
} from "./config.js";
import { MessageBucketMinutes, StatsModuleName } from "./constants.js";
import { bucketStart, splitMinutesBetween } from "./ranges.js";

interface VoiceSession {
  guildId: string;
  channelId: string;
  userId: string;
  startedAt: number;
}

const voiceSessions = new Map<string, VoiceSession>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function canTrackMember(
  config: StatsConfig,
  member: GuildMember | null | undefined,
): boolean {
  return Boolean(member && !isIgnoredMember(config, member));
}

async function closeVoiceSession(
  services: ModuleServices,
  key: string,
  session: VoiceSession,
  now: number,
): Promise<void> {
  voiceSessions.delete(key);
  const slices = splitMinutesBetween(session.startedAt, now);
  if (slices.length === 0) return;

  await Promise.all(
    slices.map((slice) =>
      services.db.prisma.statsVoiceBucket.upsert({
        where: {
          guildId_channelId_userId_bucketStart: {
            guildId: session.guildId,
            channelId: session.channelId,
            userId: session.userId,
            bucketStart: slice.bucketStart,
          },
        },
        create: {
          guildId: session.guildId,
          channelId: session.channelId,
          userId: session.userId,
          bucketStart: slice.bucketStart,
          seconds: slice.seconds,
        },
        update: { seconds: { increment: slice.seconds } },
      }),
    ),
  );
}

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
  services: ModuleServices,
  now: number = Date.now(),
): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  if (!services.modules.isEnabled(guild.id, StatsModuleName)) return;

  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const config = await getStatsConfig(services, guild.id);
  const key = sessionKey(guild.id, member.id);
  const existing = voiceSessions.get(key);

  const newChannelId = newState.channelId;
  const shouldTrackNew =
    canTrackMember(config, member) &&
    Boolean(newChannelId) &&
    !isIgnoredChannel(config, newChannelId);

  if (existing) {
    const continues = shouldTrackNew && existing.channelId === newChannelId;
    if (!continues) {
      await closeVoiceSession(services, key, existing, now);
    }
  }

  if (shouldTrackNew && newChannelId) {
    const current = voiceSessions.get(key);
    if (!current || current.channelId !== newChannelId) {
      voiceSessions.set(key, {
        guildId: guild.id,
        channelId: newChannelId,
        userId: member.id,
        startedAt: now,
      });
    }
  }
}

export async function flushVoiceSessions(
  services: ModuleServices,
  now: number = Date.now(),
  guildId?: string,
  userId?: string,
): Promise<void> {
  const keys = Array.from(voiceSessions.keys()).filter((key) => {
    const session = voiceSessions.get(key);
    if (!session) return false;
    if (guildId && session.guildId !== guildId) return false;
    if (userId && session.userId !== userId) return false;
    return true;
  });

  for (const key of keys) {
    const session = voiceSessions.get(key);
    if (!session) continue;
    await closeVoiceSession(services, key, session, now);
  }
}

export function clearVoiceSessions(): void {
  voiceSessions.clear();
}

async function recordEvent(
  services: ModuleServices,
  guildId: string,
  type: string,
  userId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await services.db.prisma.statsEvent.create({
    data: {
      guildId,
      type,
      userId: userId ?? null,
      metadata: metadata ?? {},
    },
  });
}

const messageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: ModuleServices) {
    if (!message.inGuild() || message.author.bot) return;
    if (!services.modules.isEnabled(message.guildId, StatsModuleName)) return;

    const config = await getStatsConfig(services, message.guildId);
    if (isIgnoredChannel(config, message.channelId)) return;
    if (message.member && isIgnoredMember(config, message.member)) return;

    const bucket = bucketStart(new Date(), MessageBucketMinutes);
    await services.db.prisma.statsMessageBucket.upsert({
      where: {
        guildId_channelId_userId_bucketStart: {
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          bucketStart: bucket,
        },
      },
      create: {
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        bucketStart: bucket,
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
  },
};

const voiceListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(
    oldState: VoiceState,
    newState: VoiceState,
    services: ModuleServices,
  ) {
    await handleVoiceStateUpdate(oldState, newState, services);
  },
};

const memberAddListener: ListenerDefinition = {
  event: "guildMemberAdd",
  async handler(member: GuildMember, services: ModuleServices) {
    if (!services.modules.isEnabled(member.guild.id, StatsModuleName)) return;
    await recordEvent(services, member.guild.id, "join", member.id);
  },
};

const memberRemoveListener: ListenerDefinition = {
  event: "guildMemberRemove",
  async handler(member: GuildMember, services: ModuleServices) {
    if (!services.modules.isEnabled(member.guild.id, StatsModuleName)) return;
    await flushVoiceSessions(services, Date.now(), member.guild.id, member.id);
    await recordEvent(services, member.guild.id, "leave", member.id);
  },
};

const memberUpdateListener: ListenerDefinition = {
  event: "guildMemberUpdate",
  async handler(
    oldMember: GuildMember,
    newMember: GuildMember,
    services: ModuleServices,
  ) {
    if (!services.modules.isEnabled(newMember.guild.id, StatsModuleName)) {
      return;
    }
    const wasBoosting = Boolean(oldMember.premiumSince);
    const isBoosting = Boolean(newMember.premiumSince);
    if (wasBoosting === isBoosting) return;
    await recordEvent(
      services,
      newMember.guild.id,
      isBoosting ? "boost" : "unboost",
      newMember.id,
      { tier: newMember.guild.premiumTier },
    );
  },
};

export const statsListeners: ListenerDefinition[] = [
  messageListener,
  voiceListener,
  memberAddListener,
  memberRemoveListener,
  memberUpdateListener,
];
