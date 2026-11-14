import type { GuildChannelTypes } from "discord.js";

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

export interface RestoreResult {
  rolesCreated: number;
  rolesUpdated: number;
  channelsCreated: number;
  channelsUpdated: number;
  warnings: string[];
  aborted?: boolean;
}
