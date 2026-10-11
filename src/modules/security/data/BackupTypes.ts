import { ChannelType, type Guild } from "discord.js";

interface RoleSnapshot {
  id: string;
  name: string;
  color: number;
  permissions: string;
  position: number;
  hoist: boolean;
  mentionable: boolean;
}

interface ChannelOverwriteSnapshot {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

interface ChannelSnapshot {
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

const RestorableChannelTypes = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildStageVoice,
]);

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
    .filter((channel) => RestorableChannelTypes.has(channel.type))
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
