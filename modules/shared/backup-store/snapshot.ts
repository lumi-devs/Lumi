import type { Guild } from "discord.js";
import type { BackupChannel, GuildBackupData } from "./types.js";

export function snapshotGuild(guild: Guild): GuildBackupData {
  const roles = guild.roles.cache
    .filter((role) => !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      colors: {
        primaryColor: role.colors.primaryColor,
        secondaryColor: role.colors.secondaryColor ?? null,
        tertiaryColor: role.colors.tertiaryColor ?? null,
      },
      hoist: role.hoist,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
      managed: role.managed,
      unicodeEmoji: role.unicodeEmoji ?? null,
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
      rtcRegion:
        "rtcRegion" in channel ? (channel.rtcRegion ?? null) : undefined,
      videoQualityMode:
        "videoQualityMode" in channel
          ? (channel.videoQualityMode ?? null)
          : undefined,
      defaultAutoArchiveDuration:
        "defaultAutoArchiveDuration" in channel
          ? (channel.defaultAutoArchiveDuration ?? null)
          : undefined,
      defaultThreadRateLimitPerUser:
        "defaultThreadRateLimitPerUser" in channel
          ? (channel.defaultThreadRateLimitPerUser ?? null)
          : undefined,
      availableTags:
        "availableTags" in channel
          ? channel.availableTags.map((tag) => ({
              id: tag.id ?? null,
              name: tag.name,
              moderated: tag.moderated,
              emoji: tag.emoji
                ? { id: tag.emoji.id ?? null, name: tag.emoji.name ?? null }
                : null,
            }))
          : undefined,
      defaultReactionEmoji:
        "defaultReactionEmoji" in channel
          ? channel.defaultReactionEmoji
            ? {
                id: channel.defaultReactionEmoji.id ?? null,
                name: channel.defaultReactionEmoji.name ?? null,
              }
            : null
          : undefined,
      defaultSortOrder:
        "defaultSortOrder" in channel
          ? (channel.defaultSortOrder ?? null)
          : undefined,
      defaultForumLayout:
        "defaultForumLayout" in channel
          ? (channel.defaultForumLayout ?? null)
          : undefined,
      permissionsLocked: channel.permissionsLocked ?? null,
      flags: channel.flags?.bitfield ?? null,
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
