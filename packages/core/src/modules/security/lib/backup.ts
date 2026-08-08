import { ChannelType, type Guild } from "discord.js";

export interface RoleSnapshot {
  id: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
  hoist: boolean;
  mentionable: boolean;
}

export interface ChannelOverwriteSnapshot {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

export interface ChannelSnapshot {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  overwrites: ChannelOverwriteSnapshot[];
}

export interface GuildBackupData {
  roles: RoleSnapshot[];
  channels: ChannelSnapshot[];
}

const RESTORABLE_CHANNEL_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildStageVoice,
]);

/**
 * Snapshots the guild's role and channel *structure* only - names, colors,
 * permissions, hierarchy, overwrites. Never messages, never member role
 * assignments (matches Wick's documented Imaging scope, and keeps a
 * snapshot small enough to store as JSON).
 */
export function snapshotGuild(guild: Guild): GuildBackupData {
  const roles: RoleSnapshot[] = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: role.permissions.bitfield.toString(),
      position: role.position,
      hoist: role.hoist,
      mentionable: role.mentionable,
    }));

  const channels: ChannelSnapshot[] = guild.channels.cache
    .filter((channel) => RESTORABLE_CHANNEL_TYPES.has(channel.type))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: "parentId" in channel ? (channel.parentId ?? null) : null,
      position: "position" in channel ? channel.position : 0,
      overwrites:
        "permissionOverwrites" in channel
          ? [...channel.permissionOverwrites.cache.values()].map((ow) => ({
              id: ow.id,
              type: ow.type,
              allow: ow.allow.bitfield.toString(),
              deny: ow.deny.bitfield.toString(),
            }))
          : [],
    }));

  return { roles, channels };
}
