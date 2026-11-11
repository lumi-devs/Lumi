import type { ModuleServices } from "@lumi/module-kit";
import type { Guild } from "discord.js";
import { snapshotGuild } from "./snapshot.js";
import type { BackupRecord, GuildBackupData } from "./types.js";

function isGuildBackupData(value: unknown): value is GuildBackupData {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.roles) &&
    Array.isArray(candidate.channels)
  );
}

export function toBackupRecord(record: {
  id: string;
  guildId: string;
  reason: string;
  data: unknown;
  createdAt: Date;
}): BackupRecord | null {
  if (!isGuildBackupData(record.data)) return null;
  return { ...record, data: record.data };
}

export async function createBackup(
  services: ModuleServices,
  guild: Guild,
  reason: string,
): Promise<BackupRecord | null> {
  const data = snapshotGuild(guild);
  const record = await services.helpers.security.createBackup({
    guildId: guild.id,
    reason,
    data,
  });
  return record ? toBackupRecord(record) : null;
}

export async function latestBackup(
  services: ModuleServices,
  guildId: string,
): Promise<BackupRecord | null> {
  const record = await services.helpers.security.latestBackup(guildId);
  return record ? toBackupRecord(record) : null;
}

export async function backupById(
  services: ModuleServices,
  guildId: string,
  backupId: string,
): Promise<BackupRecord | null> {
  const record = await services.helpers.security.backupById(guildId, backupId);
  return record ? toBackupRecord(record) : null;
}

export async function listBackups(
  services: ModuleServices,
  guildId: string,
  take = 10,
): Promise<BackupRecord[]> {
  const records = await services.helpers.security.listBackups(guildId, take);
  return records
    .map((record) => toBackupRecord(record))
    .filter((record): record is BackupRecord => record !== null);
}

export async function pruneBackups(
  services: ModuleServices,
  guildId: string,
  keepCount: number,
): Promise<number> {
  return services.helpers.security.pruneBackups(guildId, keepCount);
}
