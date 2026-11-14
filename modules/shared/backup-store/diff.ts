import {
  ChannelType,
  type Guild,
  type NonThreadGuildBasedChannel,
  type OverwriteData,
  OverwriteType,
  type Role,
} from "discord.js";
import type {
  BackupChange,
  BackupChannel,
  BackupDiff,
  BackupForumTag,
  BackupOverwrite,
  BackupRole,
  BackupStats,
  GuildBackupData,
} from "./types.js";

export function backupStats(data: GuildBackupData): BackupStats {
  const stats: BackupStats = {
    roles: data.roles.length,
    channels: data.channels.length,
    categories: 0,
    text: 0,
    voice: 0,
    forums: 0,
    announcements: 0,
    media: 0,
    stages: 0,
    overwrites: 0,
  };
  for (const channel of data.channels) {
    stats.overwrites += channel.permissionOverwrites.length;
    switch (channel.type) {
      case ChannelType.GuildCategory:
        stats.categories += 1;
        break;
      case ChannelType.GuildText:
        stats.text += 1;
        break;
      case ChannelType.GuildVoice:
        stats.voice += 1;
        break;
      case ChannelType.GuildForum:
        stats.forums += 1;
        break;
      case ChannelType.GuildAnnouncement:
        stats.announcements += 1;
        break;
      case ChannelType.GuildMedia:
        stats.media += 1;
        break;
      case ChannelType.GuildStageVoice:
        stats.stages += 1;
        break;
      default:
        break;
    }
  }
  return stats;
}

export function findRole(guild: Guild, role: BackupRole): Role | undefined {
  if (role.id === guild.id) return guild.roles.everyone;
  const byId = guild.roles.cache.get(role.id);
  if (byId) return byId;
  const matches = guild.roles.cache.filter(
    (candidate) => !candidate.managed && candidate.name === role.name,
  );
  return matches.size === 1 ? matches.first() : undefined;
}

export function findChannel(
  guild: Guild,
  channel: BackupChannel,
): NonThreadGuildBasedChannel | undefined {
  const byId = guild.channels.cache.get(channel.id);
  if (byId && !byId.isThread()) return byId;
  const matches = [...guild.channels.cache.values()].filter(
    (candidate): candidate is NonThreadGuildBasedChannel =>
      !candidate.isThread() &&
      candidate.name === channel.name &&
      candidate.type === channel.type,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function orderedChannels(channels: BackupChannel[]): BackupChannel[] {
  return [...channels].sort((a, b) => {
    const aCategory = a.type === ChannelType.GuildCategory ? 0 : 1;
    const bCategory = b.type === ChannelType.GuildCategory ? 0 : 1;
    return aCategory - bCategory || a.position - b.position;
  });
}

export function roleFieldChanges(
  guild: Guild,
  role: BackupRole,
  existing: Role,
): string[] {
  if (role.id === guild.id || existing.id === guild.id) {
    return existing.permissions.bitfield.toString() === role.permissions
      ? []
      : ["permissions"];
  }
  const fields: string[] = [];
  if (existing.name !== role.name) fields.push("name");
  if (existing.color !== role.color) fields.push("color");
  if (
    role.colors &&
    (existing.colors.primaryColor !== role.colors.primaryColor ||
      (existing.colors.secondaryColor ?? null) !== role.colors.secondaryColor ||
      (existing.colors.tertiaryColor ?? null) !== role.colors.tertiaryColor)
  ) {
    fields.push("colors");
  }
  if (existing.hoist !== role.hoist) fields.push("hoist");
  if (existing.mentionable !== role.mentionable) fields.push("mentionable");
  if (existing.permissions.bitfield.toString() !== role.permissions) {
    fields.push("permissions");
  }
  if (
    role.unicodeEmoji !== undefined &&
    (existing.unicodeEmoji ?? null) !== role.unicodeEmoji
  ) {
    fields.push("emoji");
  }
  if (existing.position !== role.position) fields.push("position");
  return fields;
}

function overwriteKey(overwrite: { id: string; allow: string; deny: string }) {
  return `${overwrite.id}:${overwrite.allow}:${overwrite.deny}`;
}

export function resolvedRoleOverwrites(
  overwrites: BackupOverwrite[],
  guild: Guild,
  roleMap: ReadonlyMap<string, string>,
  warnings: string[] | undefined,
  channelName: string,
): Map<string, BackupOverwrite> {
  const resolved = new Map<string, BackupOverwrite>();
  for (const overwrite of overwrites) {
    if (overwrite.type === OverwriteType.Member) continue;
    const id =
      overwrite.id === guild.id
        ? guild.id
        : (roleMap.get(overwrite.id) ?? null);
    if (!id) {
      warnings?.push(
        `Channel "${channelName}" has a permission overwrite for a role that was not restored.`,
      );
      continue;
    }
    resolved.set(id, { ...overwrite, id });
  }
  return resolved;
}

function currentRoleOverwrites(
  channel: NonThreadGuildBasedChannel,
): Map<string, BackupOverwrite> {
  const current = new Map<string, BackupOverwrite>();
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.type === OverwriteType.Member) continue;
    current.set(overwrite.id, {
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString(),
    });
  }
  return current;
}

function sameRoleOverwrites(
  a: ReadonlyMap<string, BackupOverwrite>,
  b: ReadonlyMap<string, BackupOverwrite>,
): boolean {
  if (a.size !== b.size) return false;
  const aKeys = new Set(
    [...a.values()].map((overwrite) => overwriteKey(overwrite)),
  );
  for (const overwrite of b.values()) {
    if (!aKeys.has(overwriteKey(overwrite))) return false;
  }
  return true;
}

export function permissionOverwriteData(
  overwrites: ReadonlyMap<string, BackupOverwrite>,
): OverwriteData[] {
  return [...overwrites.values()].map((overwrite) => ({
    id: overwrite.id,
    type: OverwriteType.Role,
    allow: BigInt(overwrite.allow),
    deny: BigInt(overwrite.deny),
  }));
}

export function channelFieldChanges(
  guild: Guild,
  channel: BackupChannel,
  existing: NonThreadGuildBasedChannel,
  roleMap: ReadonlyMap<string, string>,
  channelMap: ReadonlyMap<string, string>,
  warnings: string[],
): string[] {
  const fields: string[] = [];
  if (existing.name !== channel.name) fields.push("name");
  if (existing.type !== channel.type) fields.push("type");

  if (channel.type !== ChannelType.GuildCategory) {
    const expectedParent = channel.parentId
      ? (channelMap.get(channel.parentId) ?? undefined)
      : null;
    if (expectedParent === undefined) {
      warnings.push(
        `Channel "${channel.name}" references a category that was not restored.`,
      );
    } else if (existing.parentId !== expectedParent) {
      fields.push("parent");
    }
  }

  if ("topic" in existing && (existing.topic ?? null) !== channel.topic) {
    fields.push("topic");
  }
  if ("nsfw" in existing && Boolean(existing.nsfw) !== channel.nsfw) {
    fields.push("nsfw");
  }
  if (
    "rateLimitPerUser" in existing &&
    (existing.rateLimitPerUser ?? 0) !== channel.rateLimitPerUser
  ) {
    fields.push("slowmode");
  }
  if ("bitrate" in existing && (existing.bitrate ?? null) !== channel.bitrate) {
    fields.push("bitrate");
  }
  if (
    "userLimit" in existing &&
    (existing.userLimit ?? null) !== channel.userLimit
  ) {
    fields.push("userLimit");
  }
  if (
    "rtcRegion" in existing &&
    (existing.rtcRegion ?? null) !== (channel.rtcRegion ?? null)
  ) {
    fields.push("rtcRegion");
  }
  if (
    "videoQualityMode" in existing &&
    (existing.videoQualityMode ?? null) !== (channel.videoQualityMode ?? null)
  ) {
    fields.push("videoQuality");
  }
  if (
    "defaultAutoArchiveDuration" in existing &&
    (existing.defaultAutoArchiveDuration ?? null) !==
      (channel.defaultAutoArchiveDuration ?? null)
  ) {
    fields.push("autoArchive");
  }
  if (
    "defaultThreadRateLimitPerUser" in existing &&
    (existing.defaultThreadRateLimitPerUser ?? null) !==
      (channel.defaultThreadRateLimitPerUser ?? null)
  ) {
    fields.push("threadSlowmode");
  }
  if (
    "availableTags" in existing &&
    !sameForumTags(
      existing.availableTags.map((tag) => ({
        id: tag.id ?? null,
        name: tag.name,
        moderated: tag.moderated,
        emoji: tag.emoji
          ? { id: tag.emoji.id ?? null, name: tag.emoji.name ?? null }
          : null,
      })),
      channel.availableTags,
    )
  ) {
    fields.push("forumTags");
  }
  if (
    "defaultReactionEmoji" in existing &&
    defaultReactionSignature(existing.defaultReactionEmoji) !==
      defaultReactionSignature(channel.defaultReactionEmoji)
  ) {
    fields.push("defaultReaction");
  }
  if (
    "defaultSortOrder" in existing &&
    (existing.defaultSortOrder ?? null) !== (channel.defaultSortOrder ?? null)
  ) {
    fields.push("sortOrder");
  }
  if (
    "defaultForumLayout" in existing &&
    (existing.defaultForumLayout ?? null) !==
      (channel.defaultForumLayout ?? null)
  ) {
    fields.push("forumLayout");
  }
  if (
    channel.permissionsLocked !== undefined &&
    (existing.permissionsLocked ?? null) !== channel.permissionsLocked
  ) {
    fields.push("permissions");
  } else if (channel.permissionsLocked !== true) {
    const expectedOverwrites = resolvedRoleOverwrites(
      channel.permissionOverwrites,
      guild,
      roleMap,
      warnings,
      channel.name,
    );
    if (
      !sameRoleOverwrites(currentRoleOverwrites(existing), expectedOverwrites)
    ) {
      fields.push("permissions");
    }
  }
  if (
    channel.flags !== undefined &&
    channel.flags !== null &&
    existing.flags.bitfield !== channel.flags
  ) {
    fields.push("flags");
  }

  if (existing.position !== channel.position) fields.push("position");
  return fields;
}

function forumTagSignature(tag: BackupForumTag): string {
  return `${tag.name}:${tag.moderated ? 1 : 0}:${tag.emoji?.id ?? ""}:${tag.emoji?.name ?? ""}`;
}

function sameForumTags(
  left: readonly BackupForumTag[] | undefined,
  right: readonly BackupForumTag[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  if (a.length !== b.length) return false;
  const signatures = new Set(a.map(forumTagSignature));
  return b.every((tag) => signatures.has(forumTagSignature(tag)));
}

export function defaultReactionSignature(
  emoji: BackupChannel["defaultReactionEmoji"],
): string {
  return emoji ? `${emoji.id ?? ""}:${emoji.name ?? ""}` : "";
}

export function previewBackupRestore(
  guild: Guild,
  data: GuildBackupData,
): BackupDiff {
  const warnings: string[] = [];
  const roleMap = new Map<string, string>();
  const roleChanges: BackupChange[] = [];
  let unchangedRoles = 0;

  for (const role of [...data.roles].sort((a, b) => a.position - b.position)) {
    if (role.id === guild.id) {
      roleMap.set(role.id, guild.id);
      const fields = roleFieldChanges(guild, role, guild.roles.everyone);
      if (fields.length === 0) unchangedRoles += 1;
      else {
        roleChanges.push({
          id: role.id,
          name: role.name,
          action: "update",
          fields,
        });
      }
      continue;
    }

    const existing = findRole(guild, role);
    if (existing?.managed) {
      warnings.push(`Role "${role.name}" is managed and cannot be restored.`);
      continue;
    }

    if (!existing) {
      roleMap.set(role.id, `pending:${role.id}`);
      roleChanges.push({
        id: role.id,
        name: role.name,
        action: "create",
        fields: ["role"],
      });
      continue;
    }

    roleMap.set(role.id, existing.id);
    const fields = roleFieldChanges(guild, role, existing);
    if (fields.length === 0) unchangedRoles += 1;
    else {
      roleChanges.push({
        id: role.id,
        name: role.name,
        action: "update",
        fields,
      });
    }
  }

  const channelMap = new Map<string, string>();
  const channelChanges: BackupChange[] = [];
  let unchangedChannels = 0;

  for (const channel of orderedChannels(data.channels)) {
    const existing = findChannel(guild, channel);
    if (!existing) {
      channelMap.set(channel.id, `pending:${channel.id}`);
      channelChanges.push({
        id: channel.id,
        name: channel.name,
        action: "create",
        fields: ["channel"],
      });
      continue;
    }

    channelMap.set(channel.id, existing.id);
    const fields = channelFieldChanges(
      guild,
      channel,
      existing,
      roleMap,
      channelMap,
      warnings,
    );
    if (fields.length === 0) unchangedChannels += 1;
    else {
      channelChanges.push({
        id: channel.id,
        name: channel.name,
        action: "update",
        fields,
      });
    }
  }

  return {
    roles: roleChanges,
    channels: channelChanges,
    unchangedRoles,
    unchangedChannels,
    warnings: [...new Set(warnings)],
  };
}
