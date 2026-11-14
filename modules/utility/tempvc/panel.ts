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
import { tryWithLock } from "../../shared/lock.js";
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

const localCreateCooldowns = new Map<string, number>();

type CreateCooldown =
  { acquired: true; key: string } | { acquired: false; waitMs: number };

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
  const acquired = await services.helpers.utility.tempvc.claimCreateCooldown(
    key,
    cooldownMs,
  );
  if (!acquired) {
    localCreateCooldowns.delete(key);
    return { acquired: false, waitMs: cooldownMs };
  }
  return { acquired: true, key };
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
  return services.helpers.utility.tempvc.findChannel(channelId);
}

export async function updateTempRecord(
  services: ModuleServices,
  channelId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const locked = await tryWithLock(
    services,
    `tempvc:channel:${channelId}`,
    10_000,
    () => services.helpers.utility.tempvc.update(channelId, data),
    1_500,
  );
  return locked.ok ? locked.value : false;
}

export async function resolveGuildVoiceChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<VoiceChannel | null> {
  const guild: Guild | undefined =
    services?.client?.guilds?.cache?.get(guildId);
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

async function createTempVoiceChannelUnlocked(
  services: ModuleServices,
  guildId: string,
  member: GuildMember,
  config: TempVcConfig,
  generator?: TempVcGenerator,
): Promise<VoiceChannel | null> {
  const guild: Guild | undefined =
    services?.client?.guilds?.cache?.get(guildId);
  if (!guild || member.user.bot) return null;

  const ownedChannels = await services.helpers.utility.tempvc.listOwned(
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
      await services.helpers.utility.tempvc.delete(owned.channelId);
      continue;
    }
    const moved = await member.voice
      .setChannel(existing)
      .then(() => true)
      .catch(() => false);
    await updateTempRecord(services, owned.channelId, {
      expiresAt: moved ? null : new Date(Date.now() + config.emptyTimeoutMs),
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
    services.helpers.utility.tempvc.count({ guildId, ownerId: member.id }),
    services.helpers.utility.tempvc.count({ guildId }),
  ]);
  if (owned !== null && owned >= config.maxPerUser) return null;
  if (total !== null && total >= config.maxChannels) return null;

  const categoryId = config.categoryId ?? undefined;
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  const categoryParent =
    category?.type === ChannelType.GuildCategory ? category.id : undefined;
  const template = generator?.templateName ?? config.templateName;
  const name = template.replaceAll("{user}", member.displayName).slice(0, 100);

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

  const persisted = await services.helpers.utility.tempvc.create({
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
    await services.helpers.utility.tempvc.delete(channel.id);
    return null;
  }

  await channel.send(buildControlPanel(channel, record)).catch(() => undefined);
  return channel;
}

export async function createTempVoiceChannel(
  services: ModuleServices,
  guildId: string,
  member: GuildMember,
  config: TempVcConfig,
  generator?: TempVcGenerator,
): Promise<VoiceChannel | null> {
  const locked = await tryWithLock(
    services,
    `tempvc:create:${guildId}:${member.id}`,
    20_000,
    () =>
      createTempVoiceChannelUnlocked(
        services,
        guildId,
        member,
        config,
        generator,
      ),
  );
  return locked.ok ? locked.value : null;
}

async function deleteTempVoiceChannelUnlocked(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const guild: Guild | undefined =
    services?.client?.guilds?.cache?.get(guildId);
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
  await services.helpers.utility.tempvc.delete(channelId);
  return true;
}

export async function deleteTempVoiceChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const locked = await tryWithLock(
    services,
    `tempvc:channel:${channelId}`,
    15_000,
    () => deleteTempVoiceChannelUnlocked(services, guildId, channelId),
    1_500,
  );
  return locked.ok ? locked.value : false;
}

export async function deleteExpiredTempVoiceChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
  now: number,
): Promise<boolean> {
  const locked = await tryWithLock(
    services,
    `tempvc:channel:${channelId}`,
    15_000,
    async () => {
      const record = await findTempChannel(services, channelId);
      if (!record?.expiresAt) return false;
      const expiresAt = new Date(record.expiresAt).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt > now) return false;
      return deleteTempVoiceChannelUnlocked(services, guildId, channelId);
    },
    1_500,
  );
  return locked.ok ? locked.value : false;
}

export async function sweepExpiredTempChannels(
  services: ModuleServices,
): Promise<void> {
  const rows = await services.helpers.utility.tempvc.listExpired();
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
    await deleteExpiredTempVoiceChannel(
      services,
      row.guildId,
      row.channelId,
      now,
    );
  }
}
