import type { ModuleServices } from "@lumi/module-kit";
import { type CardReply, makeWarningCard } from "@lumi/ui";
import {
  ChannelType,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type VoiceChannel,
} from "discord.js";
import { z } from "zod";
import { type ControlPanelState, controlPanelCard } from "./ui.js";

export const TempVcGeneratorSchema = z.object({
  channelId: z.string(),
  templateName: z.string().optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
});

export const TempVcConfigSchema = z.object({
  categoryId: z.string().nullable().optional(),
  templateName: z.string().default("➕ {user}'s Channel"),
  defaultBitrate: z.number().int().min(8000).max(384000).default(64000),
  defaultUserLimit: z.number().int().min(0).max(99).default(0),
  maxChannels: z.number().int().min(1).max(200).default(50),
  maxPerUser: z.number().int().min(1).max(10).default(1),
  emptyTimeoutMs: z.number().int().min(1000).default(300000),
  createCooldownMs: z.number().int().min(0).max(300000).default(10000),
  ownerLeaveDelete: z.boolean().default(true),
  generators: z.array(TempVcGeneratorSchema).default([]),
});

export type TempVcConfig = z.infer<typeof TempVcConfigSchema>;
export type TempVcGenerator = z.infer<typeof TempVcGeneratorSchema>;

export interface TempVcRecord {
  guildId: string;
  channelId: string;
  ownerId: string;
  expiresAt?: Date | string | null;
}

export interface ManagedChannel {
  record: TempVcRecord;
  channel: VoiceChannel;
}

const prisma = (services: ModuleServices): any => services?.db?.prisma;

const localCreateCooldowns = new Map<string, number>();

type CreateCooldown =
  | { acquired: true; key: string }
  | { acquired: false; waitMs: number };

async function acquireCreateCooldown(
  services: ModuleServices,
  guildId: string,
  userId: string,
  cooldownMs: number,
): Promise<CreateCooldown> {
  if (cooldownMs <= 0) return { acquired: true, key: "" };
  const key = `lumi:tempvc:create:${guildId}:${userId}`;
  const now = Date.now();
  const localUntil = localCreateCooldowns.get(key) ?? 0;
  if (localUntil > now) {
    return { acquired: false, waitMs: localUntil - now };
  }
  if (localCreateCooldowns.size > 1000) {
    for (const [entry, until] of localCreateCooldowns) {
      if (until <= now) localCreateCooldowns.delete(entry);
    }
  }
  localCreateCooldowns.set(key, now + cooldownMs);
  const redis = services?.redis;
  if (!redis || typeof redis.set !== "function") {
    return { acquired: true, key };
  }
  try {
    const result = await redis.set(key, "1", "PX", cooldownMs, "NX");
    if (result !== "OK") {
      localCreateCooldowns.delete(key);
      let waitMs = cooldownMs;
      if (typeof redis.pttl === "function") {
        try {
          const ttl = await redis.pttl(key);
          if (typeof ttl === "number" && ttl > 0) waitMs = ttl;
        } catch {
          waitMs = cooldownMs;
        }
      }
      return { acquired: false, waitMs };
    }
    return { acquired: true, key };
  } catch {
    return { acquired: true, key };
  }
}

async function notifyCreateCooldown(
  member: GuildMember,
  waitMs: number,
): Promise<void> {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  await member.voice
    .disconnect("Temporary channel creation cooldown")
    .catch(() => undefined);
  await member
    .send(makeWarningCard("Slow Down", `Try again in ${seconds}s.`))
    .catch(() => undefined);
}

export async function findTempChannel(
  services: ModuleServices,
  channelId: string,
): Promise<TempVcRecord | null> {
  const model = prisma(services)?.tempVcChannel;
  if (!model) return null;
  try {
    if (typeof model.findUnique === "function") {
      return (await model.findUnique({ where: { channelId } })) ?? null;
    }
    if (typeof model.findFirst === "function") {
      return (await model.findFirst({ where: { channelId } })) ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function listOwnedTempChannels(
  services: ModuleServices,
  guildId: string,
  ownerId: string,
): Promise<TempVcRecord[]> {
  const model = prisma(services)?.tempVcChannel;
  if (!model) return [];
  try {
    if (typeof model.findMany === "function") {
      const rows = await model.findMany({
        where: { guildId, ownerId },
        orderBy: { createdAt: "desc" },
      });
      return Array.isArray(rows) ? rows : [];
    }
    if (typeof model.findFirst === "function") {
      const row = await model.findFirst({ where: { guildId, ownerId } });
      return row ? [row] : [];
    }
  } catch {
    return [];
  }
  return [];
}

async function createTempRecord(
  services: ModuleServices,
  data: {
    guildId: string;
    channelId: string;
    ownerId: string;
    expiresAt: Date;
  },
): Promise<boolean> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.create !== "function") return false;
  try {
    await model.create({ data });
    return true;
  } catch {
    return false;
  }
}

export async function updateTempRecord(
  services: ModuleServices,
  channelId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.update !== "function") return false;
  try {
    await model.update({ where: { channelId }, data });
    return true;
  } catch {
    return false;
  }
}

async function deleteTempRecord(
  services: ModuleServices,
  channelId: string,
): Promise<void> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.delete !== "function") return;
  try {
    await model.delete({ where: { channelId } });
  } catch {
    return;
  }
}

async function countTempChannels(
  services: ModuleServices,
  where: Record<string, unknown>,
): Promise<number | null> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.count !== "function") return null;
  try {
    const count = await model.count({ where });
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

async function listExpiredTempChannels(
  services: ModuleServices,
): Promise<TempVcRecord[]> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.findMany !== "function") return [];
  try {
    const rows = await model.findMany({
      where: { expiresAt: { not: null, lte: new Date() } },
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function resolveGuildVoiceChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<VoiceChannel | null> {
  const guild: Guild | undefined = services?.client?.guilds?.cache?.get(guildId);
  if (!guild) return null;
  const cached = guild.channels.cache.get(channelId);
  const channel =
    cached ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel;
}

export function controlState(
  channel: VoiceChannel,
  record: TempVcRecord,
): ControlPanelState {
  const everyone = channel.guild.roles.everyone;
  const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
  return {
    channelId: channel.id,
    channelName: channel.name,
    ownerId: record.ownerId,
    userLimit: channel.userLimit ?? 0,
    memberCount: channel.members.size,
    locked: overwrite?.deny.has(PermissionFlagsBits.Connect) ?? false,
    hidden: overwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false,
    ownerPresent: channel.members.has(record.ownerId),
  };
}

export function buildControlPanel(
  channel: VoiceChannel,
  record: TempVcRecord,
  notice?: string,
): CardReply {
  return controlPanelCard(controlState(channel, record), notice);
}

export async function buildControlPanelForChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<CardReply | null> {
  const record = await findTempChannel(services, channelId);
  if (!record || record.guildId !== guildId) return null;
  const channel = await resolveGuildVoiceChannel(services, guildId, channelId);
  if (!channel) return null;
  return buildControlPanel(channel, record);
}

export async function createTempVoiceChannel(
  services: ModuleServices,
  guildId: string,
  member: GuildMember,
  config: TempVcConfig,
  generator?: TempVcGenerator,
): Promise<VoiceChannel | null> {
  const guild: Guild | undefined = services?.client?.guilds?.cache?.get(guildId);
  if (!guild || member.user.bot) return null;

  const ownedChannels = await listOwnedTempChannels(
    services,
    guildId,
    member.id,
  );
  for (const owned of ownedChannels) {
    const existing = await resolveGuildVoiceChannel(
      services,
      guildId,
      owned.channelId,
    );
    if (!existing) {
      await deleteTempRecord(services, owned.channelId);
      continue;
    }
    const moved = await member.voice
      .setChannel(existing)
      .then(() => true)
      .catch(() => false);
    await updateTempRecord(services, owned.channelId, {
      expiresAt: moved
        ? null
        : new Date(Date.now() + config.emptyTimeoutMs),
    });
    return moved ? existing : null;
  }

  const cooldown = await acquireCreateCooldown(
    services,
    guildId,
    member.id,
    config.createCooldownMs,
  );
  if (!cooldown.acquired) {
    await notifyCreateCooldown(member, cooldown.waitMs);
    return null;
  }

  const [owned, total] = await Promise.all([
    countTempChannels(services, { guildId, ownerId: member.id }),
    countTempChannels(services, { guildId }),
  ]);
  if (owned !== null && owned >= config.maxPerUser) return null;
  if (total !== null && total >= config.maxChannels) return null;

  const categoryId = config.categoryId ?? undefined;
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  const categoryParent =
    category?.type === ChannelType.GuildCategory ? category.id : undefined;
  const template = generator?.templateName ?? config.templateName;
  const name = template
    .replaceAll("{user}", member.displayName)
    .slice(0, 100);

  let channel: VoiceChannel;
  try {
    channel = (await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      ...(categoryParent ? { parent: categoryParent } : {}),
      bitrate: config.defaultBitrate,
      userLimit: generator?.userLimit ?? config.defaultUserLimit,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseVAD,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
          ],
        },
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseVAD,
          ],
        },
      ],
    })) as VoiceChannel;
  } catch {
    return null;
  }

  const expiresAt = new Date(Date.now() + config.emptyTimeoutMs);
  const record: TempVcRecord = {
    guildId,
    channelId: channel.id,
    ownerId: member.id,
    expiresAt,
  };

  const persisted = await createTempRecord(services, {
    guildId,
    channelId: channel.id,
    ownerId: member.id,
    expiresAt,
  });
  if (!persisted) {
    await channel.delete().catch(() => undefined);
    return null;
  }

  const moved = await member.voice
    .setChannel(channel)
    .then(() => true)
    .catch(() => false);
  if (!moved) {
    await channel.delete().catch(() => undefined);
    await deleteTempRecord(services, channel.id);
    return null;
  }

  await channel.send(buildControlPanel(channel, record)).catch(() => undefined);
  return channel;
}

export async function deleteTempVoiceChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const guild: Guild | undefined = services?.client?.guilds?.cache?.get(guildId);
  const channel =
    guild?.channels.cache.get(channelId) ??
    (await guild?.channels.fetch(channelId).catch(() => null));
  if (channel) {
    const deleted = await channel
      .delete()
      .then(() => true)
      .catch(() => false);
    if (!deleted) return false;
  }
  await deleteTempRecord(services, channelId);
  return true;
}

export async function sweepExpiredTempChannels(services: ModuleServices): Promise<void> {
  const rows = await listExpiredTempChannels(services);
  if (rows.length === 0) return;
  const now = Date.now();
  for (const row of rows) {
    if (!row.expiresAt) continue;
    const expiresAt = new Date(row.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt > now) continue;
    const guild: Guild | undefined = services?.client?.guilds?.cache?.get(
      row.guildId,
    );
    const channel = guild?.channels.cache.get(row.channelId);
    if (
      channel &&
      channel.type === ChannelType.GuildVoice &&
      channel.members.size > 0
    ) {
      continue;
    }
    await deleteTempVoiceChannel(services, row.guildId, row.channelId);
  }
}
