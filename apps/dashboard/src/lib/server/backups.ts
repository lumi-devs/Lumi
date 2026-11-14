import type { BackupStats } from "./rpc.js";

const ChannelType = {
  Text: 0,
  Voice: 2,
  Category: 4,
  Announcement: 5,
  Stage: 13,
  Forum: 15,
  Media: 16,
} as const;

interface StoredChannel {
  type?: number;
  permissionOverwrites?: unknown[];
}

interface StoredBackupData {
  roles?: unknown[];
  channels?: StoredChannel[];
}

export function storedBackupStats(data: unknown): BackupStats {
  const backup = (data ?? {}) as StoredBackupData;
  const stats: BackupStats = {
    roles: backup.roles?.length ?? 0,
    channels: backup.channels?.length ?? 0,
    categories: 0,
    text: 0,
    voice: 0,
    forums: 0,
    announcements: 0,
    media: 0,
    stages: 0,
    overwrites: 0,
  };

  for (const channel of backup.channels ?? []) {
    stats.overwrites += channel.permissionOverwrites?.length ?? 0;
    switch (channel.type) {
      case ChannelType.Category:
        stats.categories += 1;
        break;
      case ChannelType.Text:
        stats.text += 1;
        break;
      case ChannelType.Voice:
        stats.voice += 1;
        break;
      case ChannelType.Forum:
        stats.forums += 1;
        break;
      case ChannelType.Announcement:
        stats.announcements += 1;
        break;
      case ChannelType.Media:
        stats.media += 1;
        break;
      case ChannelType.Stage:
        stats.stages += 1;
        break;
      default:
        break;
    }
  }

  return stats;
}
