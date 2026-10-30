import type { ModuleServices } from "@lumi/module-kit";
import {
  ChannelType,
  type Guild,
  type GuildChannelTypes,
  type OverwriteData,
  OverwriteType,
} from "discord.js";

export interface BackupOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

export interface BackupRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: string;
  mentionable: boolean;
  managed: boolean;
}

export interface BackupChannel {
  id: string;
  name: string;
  type: GuildChannelTypes;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  rateLimitPerUser: number;
  bitrate: number | null;
  userLimit: number | null;
  permissionOverwrites: BackupOverwrite[];
}

export interface GuildBackupData {
  version: 1;
  roles: BackupRole[];
  channels: BackupChannel[];
}

export interface BackupRecord {
  id: string;
  guildId: string;
  reason: string;
  data: GuildBackupData;
  createdAt: Date;
}

interface BackupClient {
  securityBackup: {
    create(args: unknown): Promise<BackupRecord>;
    findFirst(args: unknown): Promise<BackupRecord | null>;
    findMany(args: unknown): Promise<BackupRecord[]>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

function backupClient(services: ModuleServices): BackupClient | null {
  const prisma = services.db?.prisma as
    { securityBackup?: BackupClient["securityBackup"] } | undefined;
  if (!prisma?.securityBackup) return null;
  return prisma as unknown as BackupClient;
}

export function snapshotGuild(guild: Guild): GuildBackupData {
  const roles = guild.roles.cache
    .filter((role) => !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
      managed: role.managed,
    }));

  const channels: BackupChannel[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread()) continue;
    channels.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: "position" in channel ? channel.position : 0,
      topic: "topic" in channel ? (channel.topic ?? null) : null,
      nsfw: "nsfw" in channel ? Boolean(channel.nsfw) : false,
      rateLimitPerUser:
        "rateLimitPerUser" in channel ? (channel.rateLimitPerUser ?? 0) : 0,
      bitrate: "bitrate" in channel ? (channel.bitrate ?? null) : null,
      userLimit: "userLimit" in channel ? (channel.userLimit ?? null) : null,
      permissionOverwrites: channel.permissionOverwrites.cache.map(
        (overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString(),
        }),
      ),
    });
  }

  return { version: 1, roles, channels };
}

export async function createBackup(
  services: ModuleServices,
  guild: Guild,
  reason: string,
): Promise<BackupRecord | null> {
  const client = backupClient(services);
  if (!client) return null;
  const data = snapshotGuild(guild);
  return client.securityBackup.create({
    data: { guildId: guild.id, reason, data },
  });
}

export async function latestBackup(
  services: ModuleServices,
  guildId: string,
): Promise<BackupRecord | null> {
  const client = backupClient(services);
  if (!client) return null;
  return client.securityBackup.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listBackups(
  services: ModuleServices,
  guildId: string,
  take = 10,
): Promise<BackupRecord[]> {
  const client = backupClient(services);
  if (!client) return [];
  return client.securityBackup.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function pruneBackups(
  services: ModuleServices,
  guildId: string,
  keepCount: number,
): Promise<number> {
  const client = backupClient(services);
  if (!client) return 0;
  const keep = await client.securityBackup.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: keepCount,
    select: { id: true },
  });
  const keepIds = keep.map((entry) => entry.id);
  const result = await client.securityBackup.deleteMany({
    where: { guildId, id: { notIn: keepIds } },
  });
  return result.count;
}

function channelParent(
  channel: BackupChannel,
  created: Map<string, string>,
): string | undefined {
  if (!channel.parentId) return undefined;
  return created.get(channel.parentId);
}

function overwriteOptions(
  overwrites: BackupOverwrite[],
  guild: Guild,
  roleMap: Map<string, string>,
): OverwriteData[] | undefined {
  const options: OverwriteData[] = [];
  for (const overwrite of overwrites) {
    if (overwrite.type === OverwriteType.Member) continue;
    const id =
      overwrite.id === guild.id
        ? guild.id
        : (roleMap.get(overwrite.id) ?? null);
    if (!id) continue;
    options.push({
      id,
      type: OverwriteType.Role,
      allow: BigInt(overwrite.allow),
      deny: BigInt(overwrite.deny),
    });
  }
  return options.length > 0 ? options : undefined;
}

export interface RestoreResult {
  roles: number;
  channels: number;
}

export async function restoreBackup(
  services: ModuleServices,
  guild: Guild,
  data: GuildBackupData,
): Promise<RestoreResult> {
  const roleMap = new Map<string, string>();
  let roles = 0;

  for (const role of data.roles) {
    if (role.id === guild.id) {
      roleMap.set(role.id, guild.id);
      continue;
    }
    const existing = guild.roles.cache.find(
      (candidate) => candidate.name === role.name,
    );
    if (existing) {
      roleMap.set(role.id, existing.id);
      continue;
    }
    const created = await guild.roles
      .create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        permissions: BigInt(role.permissions),
        mentionable: role.mentionable,
        reason: "Security restore",
      })
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.("security restore role failed", {
          guildId: guild.id,
          role: role.name,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    if (!created) continue;
    roleMap.set(role.id, created.id);
    roles += 1;
  }

  const channelMap = new Map<string, string>();
  let channels = 0;
  const ordered = [...data.channels].sort((a, b) => {
    const aCategory = a.type === ChannelType.GuildCategory ? 0 : 1;
    const bCategory = b.type === ChannelType.GuildCategory ? 0 : 1;
    return aCategory - bCategory || a.position - b.position;
  });

  for (const channel of ordered) {
    const existing = guild.channels.cache.find(
      (candidate) =>
        candidate.name === channel.name && candidate.type === channel.type,
    );
    if (existing) {
      channelMap.set(channel.id, existing.id);
      continue;
    }
    const created = await guild.channels
      .create({
        name: channel.name,
        type: channel.type,
        parent: channelParent(channel, channelMap),
        topic: channel.topic ?? undefined,
        nsfw: channel.nsfw,
        rateLimitPerUser: channel.rateLimitPerUser,
        bitrate: channel.bitrate ?? undefined,
        userLimit: channel.userLimit ?? undefined,
        permissionOverwrites: overwriteOptions(
          channel.permissionOverwrites,
          guild,
          roleMap,
        ),
        reason: "Security restore",
      })
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.(
          "security restore channel failed",
          {
            guildId: guild.id,
            channel: channel.name,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return null;
      });
    if (!created) continue;
    channelMap.set(channel.id, created.id);
    channels += 1;
  }

  return { roles, channels };
}
