import {
  ChannelType,
  type Guild,
  type GuildChannelEditOptions,
  type GuildChannelTypes,
  type NonThreadGuildBasedChannel,
  OverwriteType,
  type Role,
} from "discord.js";
import {
  channelFieldChanges,
  findChannel,
  findRole,
  orderedChannels,
  permissionOverwriteData,
  resolvedRoleOverwrites,
  roleFieldChanges,
} from "./diff.js";
import type {
  BackupChannel,
  BackupForumTag,
  BackupRole,
  GuildBackupData,
  RestoreResult,
} from "./types.js";

interface RestoreServices {
  observability?: {
    logger?: {
      warn?: (message: string, meta?: unknown) => void;
      info?: (message: string, meta?: unknown) => void;
    };
  };
}

function loggerOf(services: RestoreServices) {
  return services.observability?.logger;
}

function warn(services: RestoreServices, message: string, meta: unknown): void {
  loggerOf(services)?.warn?.(message, meta);
}

function roleEditData(role: BackupRole): Parameters<Role["edit"]>[0] {
  return {
    name: role.name,
    color: role.color,
    ...(role.colors ? { colors: role.colors } : {}),
    hoist: role.hoist,
    permissions: BigInt(role.permissions),
    mentionable: role.mentionable,
    ...(role.unicodeEmoji !== undefined
      ? { unicodeEmoji: role.unicodeEmoji }
      : {}),
    reason: "Security restore",
  };
}

function roleCreateData(role: BackupRole) {
  return {
    name: role.name,
    color: role.color,
    ...(role.colors
      ? {
          colors: {
            primaryColor: role.colors.primaryColor,
            ...(role.colors.secondaryColor !== null
              ? { secondaryColor: role.colors.secondaryColor }
              : {}),
            ...(role.colors.tertiaryColor !== null
              ? { tertiaryColor: role.colors.tertiaryColor }
              : {}),
          },
        }
      : {}),
    hoist: role.hoist,
    permissions: BigInt(role.permissions),
    mentionable: role.mentionable,
    ...(role.unicodeEmoji !== undefined
      ? { unicodeEmoji: role.unicodeEmoji }
      : {}),
    reason: "Security restore",
  };
}

function isTextChannelType(type: GuildChannelTypes): boolean {
  return (
    type === ChannelType.GuildText ||
    type === ChannelType.GuildAnnouncement ||
    type === ChannelType.GuildForum ||
    type === ChannelType.GuildMedia
  );
}

function isForumChannelType(type: GuildChannelTypes): boolean {
  return type === ChannelType.GuildForum || type === ChannelType.GuildMedia;
}

function isVoiceChannelType(type: GuildChannelTypes): boolean {
  return (
    type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice
  );
}

function forumTagData(
  tags: readonly BackupForumTag[] | undefined,
  existingTags: readonly BackupForumTag[] | undefined,
) {
  if (tags === undefined) return undefined;
  const existingByName = new Map(
    (existingTags ?? []).map((tag) => [tag.name, tag] as const),
  );
  return tags.map((tag) => {
    const existing = existingByName.get(tag.name);
    return {
      ...(existing?.id ? { id: existing.id } : {}),
      name: tag.name,
      moderated: tag.moderated,
      emoji: tag.emoji ? { id: tag.emoji.id, name: tag.emoji.name } : undefined,
    };
  });
}

function channelEditData(
  channel: BackupChannel,
  channelMap: ReadonlyMap<string, string>,
  existing?: NonThreadGuildBasedChannel,
): GuildChannelEditOptions {
  const data: GuildChannelEditOptions = {
    name: channel.name,
    reason: "Security restore",
  };
  if (channel.type !== ChannelType.GuildCategory) {
    const parent = channel.parentId
      ? (channelMap.get(channel.parentId) ?? null)
      : null;
    data.parent = parent;
  }
  if (isTextChannelType(channel.type)) {
    data.topic = channel.topic ?? undefined;
    data.nsfw = channel.nsfw;
    data.rateLimitPerUser = channel.rateLimitPerUser;
  }
  if (isVoiceChannelType(channel.type)) {
    data.bitrate = channel.bitrate ?? undefined;
    data.userLimit = channel.userLimit ?? undefined;
    data.nsfw = channel.nsfw;
    data.rateLimitPerUser = channel.rateLimitPerUser;
  }
  if (channel.type === ChannelType.GuildStageVoice) {
    data.topic = channel.topic ?? undefined;
  }
  if ("defaultAutoArchiveDuration" in channel) {
    data.defaultAutoArchiveDuration =
      channel.defaultAutoArchiveDuration ?? undefined;
  }
  if ("defaultThreadRateLimitPerUser" in channel) {
    data.defaultThreadRateLimitPerUser =
      channel.defaultThreadRateLimitPerUser ?? undefined;
  }
  if (isForumChannelType(channel.type)) {
    data.availableTags = forumTagData(
      channel.availableTags,
      existing && "availableTags" in existing
        ? existing.availableTags.map((tag) => ({
            id: tag.id ?? null,
            name: tag.name,
            moderated: tag.moderated,
            emoji: tag.emoji
              ? { id: tag.emoji.id ?? null, name: tag.emoji.name ?? null }
              : null,
          }))
        : undefined,
    );
    data.defaultReactionEmoji = channel.defaultReactionEmoji ?? undefined;
    data.defaultSortOrder = channel.defaultSortOrder ?? undefined;
    if (channel.type === ChannelType.GuildForum) {
      data.defaultForumLayout = channel.defaultForumLayout ?? undefined;
    }
  }
  if (isVoiceChannelType(channel.type)) {
    data.rtcRegion = channel.rtcRegion ?? undefined;
    data.videoQualityMode = channel.videoQualityMode ?? undefined;
  }
  if (channel.flags !== undefined && channel.flags !== null) {
    data.flags = channel.flags;
  }
  return data;
}

function channelCreateData(
  guild: Guild,
  channel: BackupChannel,
  roleMap: ReadonlyMap<string, string>,
  channelMap: ReadonlyMap<string, string>,
) {
  const data = channelEditData(channel, channelMap);
  return {
    name: channel.name,
    type: channel.type,
    parent: data.parent ?? undefined,
    topic: data.topic ?? undefined,
    nsfw: data.nsfw,
    rateLimitPerUser: data.rateLimitPerUser,
    bitrate: data.bitrate,
    userLimit: data.userLimit,
    rtcRegion: data.rtcRegion ?? undefined,
    videoQualityMode: data.videoQualityMode ?? undefined,
    defaultAutoArchiveDuration: data.defaultAutoArchiveDuration,
    defaultThreadRateLimitPerUser: data.defaultThreadRateLimitPerUser,
    availableTags: data.availableTags,
    defaultReactionEmoji: data.defaultReactionEmoji ?? undefined,
    defaultSortOrder: data.defaultSortOrder ?? undefined,
    defaultForumLayout: data.defaultForumLayout,
    flags: data.flags,
    permissionOverwrites: permissionOverwriteData(
      resolvedRoleOverwrites(
        channel.permissionOverwrites,
        guild,
        roleMap,
        undefined,
        channel.name,
      ),
    ),
    reason: "Security restore",
  };
}

export async function restoreBackup(
  services: RestoreServices,
  guild: Guild,
  data: GuildBackupData,
): Promise<RestoreResult> {
  const warnings: string[] = [];
  const roleMap = new Map<string, string>();
  let rolesCreated = 0;
  let rolesUpdated = 0;

  for (const role of [...data.roles].sort((a, b) => a.position - b.position)) {
    if (role.id === guild.id) {
      roleMap.set(role.id, guild.id);
      const fields = roleFieldChanges(guild, role, guild.roles.everyone);
      if (fields.length > 0) {
        try {
          await guild.roles.everyone.edit({
            permissions: BigInt(role.permissions),
            reason: "Security restore",
          });
          rolesUpdated += 1;
        } catch (error) {
          warnings.push(`Could not update @everyone permissions.`);
          warn(services, "security restore @everyone failed", {
            guildId: guild.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      continue;
    }

    const existing = findRole(guild, role);
    if (existing?.managed) {
      warnings.push(`Role "${role.name}" is managed and cannot be restored.`);
      continue;
    }

    if (existing) {
      roleMap.set(role.id, existing.id);
      const fields = roleFieldChanges(guild, role, existing);
      if (fields.length === 0) continue;
      try {
        await existing.edit(roleEditData(role));
        rolesUpdated += 1;
      } catch (error) {
        warnings.push(`Could not update role "${role.name}".`);
        warn(services, "security restore role failed", {
          guildId: guild.id,
          role: role.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    try {
      const created = await guild.roles.create(roleCreateData(role));
      roleMap.set(role.id, created.id);
      rolesCreated += 1;
    } catch (error) {
      warnings.push(`Could not create role "${role.name}".`);
      warn(services, "security restore role failed", {
        guildId: guild.id,
        role: role.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const botHighest = guild.members.me?.roles.highest.position ?? 0;
  const rolePositions: Array<{ role: string; position: number }> = [];
  for (const role of data.roles) {
    if (role.id === guild.id) continue;
    const actual = roleMap.get(role.id);
    if (!actual) continue;
    if (role.position >= botHighest) {
      warnings.push(`Skipped position for role "${role.name}" above the bot.`);
      continue;
    }
    rolePositions.push({ role: actual, position: role.position });
  }
  if (rolePositions.length > 0) {
    try {
      await guild.roles.setPositions(rolePositions);
    } catch (error) {
      warnings.push("Could not restore role positions.");
      warn(services, "security restore role positions failed", {
        guildId: guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const channelMap = new Map<string, string>();
  let channelsCreated = 0;
  let channelsUpdated = 0;

  for (const channel of orderedChannels(data.channels)) {
    const existing = findChannel(guild, channel);
    if (existing) {
      channelMap.set(channel.id, existing.id);
      const fields = channelFieldChanges(
        guild,
        channel,
        existing,
        roleMap,
        channelMap,
        warnings,
      );
      if (fields.length === 0) continue;

      if (fields.includes("type")) {
        warnings.push(
          `Channel "${channel.name}" changed type and cannot be updated in place.`,
        );
      }

      try {
        await existing.edit({
          ...channelEditData(channel, channelMap),
          ...(fields.includes("permissions")
            ? {
                permissionOverwrites: [
                  ...permissionOverwriteData(
                    resolvedRoleOverwrites(
                      channel.permissionOverwrites,
                      guild,
                      roleMap,
                      warnings,
                      channel.name,
                    ),
                  ),
                  ...[...existing.permissionOverwrites.cache.values()]
                    .filter(
                      (overwrite) => overwrite.type === OverwriteType.Member,
                    )
                    .map((overwrite) => ({
                      id: overwrite.id,
                      type: OverwriteType.Member,
                      allow: overwrite.allow.bitfield,
                      deny: overwrite.deny.bitfield,
                    })),
                ],
              }
            : {}),
        });
        channelsUpdated += 1;
      } catch (error) {
        warnings.push(`Could not update channel "${channel.name}".`);
        warn(services, "security restore channel failed", {
          guildId: guild.id,
          channel: channel.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    try {
      const created = await guild.channels.create(
        channelCreateData(guild, channel, roleMap, channelMap),
      );
      channelMap.set(channel.id, created.id);
      channelsCreated += 1;
    } catch (error) {
      warnings.push(`Could not create channel "${channel.name}".`);
      warn(services, "security restore channel failed", {
        guildId: guild.id,
        channel: channel.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const channelPositions: Array<{ channel: string; position: number }> = [];
  for (const channel of orderedChannels(data.channels)) {
    const actual = channelMap.get(channel.id);
    if (!actual) continue;
    channelPositions.push({ channel: actual, position: channel.position });
  }
  if (channelPositions.length > 0) {
    try {
      await guild.channels.setPositions(channelPositions);
    } catch (error) {
      warnings.push("Could not restore channel positions.");
      warn(services, "security restore channel positions failed", {
        guildId: guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    rolesCreated,
    rolesUpdated,
    channelsCreated,
    channelsUpdated,
    warnings: [...new Set(warnings)],
  };
}
