import type { ModuleServices } from "@lumi/module-kit";
import {
  ChannelType,
  type Guild,
  type GuildChannelEditOptions,
  type GuildChannelTypes,
  type NonThreadGuildBasedChannel,
  type OverwriteData,
  OverwriteType,
  type Role,
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
  colors?: {
    primaryColor: number;
    secondaryColor: number | null;
    tertiaryColor: number | null;
  };
  hoist: boolean;
  position: number;
  permissions: string;
  mentionable: boolean;
  managed: boolean;
  unicodeEmoji?: string | null;
}

export interface BackupForumTag {
  id: string | null;
  name: string;
  moderated: boolean;
  emoji: { id: string | null; name: string | null } | null;
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
  rtcRegion?: string | null;
  videoQualityMode?: number | null;
  defaultAutoArchiveDuration?: number | null;
  defaultThreadRateLimitPerUser?: number | null;
  availableTags?: BackupForumTag[];
  defaultReactionEmoji?: { id: string | null; name: string | null } | null;
  defaultSortOrder?: number | null;
  defaultForumLayout?: number | null;
  permissionsLocked?: boolean | null;
  flags?: number | null;
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

export type BackupChangeAction = "create" | "update";

export interface BackupChange {
  id: string;
  name: string;
  action: BackupChangeAction;
  fields: string[];
}

export interface BackupDiff {
  roles: BackupChange[];
  channels: BackupChange[];
  unchangedRoles: number;
  unchangedChannels: number;
  warnings: string[];
}

export interface BackupStats {
  roles: number;
  channels: number;
  categories: number;
  text: number;
  voice: number;
  forums: number;
  announcements: number;
  media: number;
  stages: number;
  overwrites: number;
}

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

interface BackupClient {
  securityBackup: {
    create(args: unknown): Promise<BackupRecord>;
    findFirst(args: unknown): Promise<BackupRecord | null>;
    findMany(args: unknown): Promise<BackupRecord[]>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

interface RestoreServices {
  db?: { prisma?: unknown } | undefined;
  observability?: {
    logger?: {
      warn?: (message: string, meta?: unknown) => void;
      info?: (message: string, meta?: unknown) => void;
    };
  };
}

function backupClient(services: ModuleServices): BackupClient | null {
  const prisma = services.db?.prisma as
    { securityBackup?: BackupClient["securityBackup"] } | undefined;
  if (!prisma?.securityBackup) return null;
  return prisma as unknown as BackupClient;
}

function loggerOf(services: RestoreServices) {
  return services.observability?.logger;
}

function warn(services: RestoreServices, message: string, meta: unknown): void {
  loggerOf(services)?.warn?.(message, meta);
}

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

export async function backupById(
  services: ModuleServices,
  guildId: string,
  backupId: string,
): Promise<BackupRecord | null> {
  const client = backupClient(services);
  if (!client) return null;
  return client.securityBackup.findFirst({
    where: { id: backupId, guildId },
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

function findRole(guild: Guild, role: BackupRole): Role | undefined {
  if (role.id === guild.id) return guild.roles.everyone;
  const byId = guild.roles.cache.get(role.id);
  if (byId) return byId;
  const matches = guild.roles.cache.filter(
    (candidate) => !candidate.managed && candidate.name === role.name,
  );
  return matches.size === 1 ? matches.first() : undefined;
}

function findChannel(
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

function orderedChannels(channels: BackupChannel[]): BackupChannel[] {
  return [...channels].sort((a, b) => {
    const aCategory = a.type === ChannelType.GuildCategory ? 0 : 1;
    const bCategory = b.type === ChannelType.GuildCategory ? 0 : 1;
    return aCategory - bCategory || a.position - b.position;
  });
}

function roleFieldChanges(
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

function overwriteKey(overwrite: { id: string; allow: string; deny: string }) {
  return `${overwrite.id}:${overwrite.allow}:${overwrite.deny}`;
}

function resolvedRoleOverwrites(
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

function permissionOverwriteData(
  overwrites: ReadonlyMap<string, BackupOverwrite>,
): OverwriteData[] {
  return [...overwrites.values()].map((overwrite) => ({
    id: overwrite.id,
    type: OverwriteType.Role,
    allow: BigInt(overwrite.allow),
    deny: BigInt(overwrite.deny),
  }));
}

function channelFieldChanges(
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

function defaultReactionSignature(
  emoji: BackupChannel["defaultReactionEmoji"],
): string {
  return emoji ? `${emoji.id ?? ""}:${emoji.name ?? ""}` : "";
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

export interface RestoreResult {
  rolesCreated: number;
  rolesUpdated: number;
  channelsCreated: number;
  channelsUpdated: number;
  warnings: string[];
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
