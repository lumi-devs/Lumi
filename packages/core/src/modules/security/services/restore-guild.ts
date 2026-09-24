import { container } from "@sapphire/framework";
import { ChannelType, type Guild } from "discord.js";
import type { GuildBackupData } from "./backup-types.js";

/**
 * Recreates roles and channels present in the snapshot but missing from
 * the guild now. Best-effort: exact position/id can't be preserved (a
 * recreated role/channel gets a new Discord id), only name, permissions,
 * hierarchy-adjacent position, and (for channels) parent + overwrites.
 */
export async function restoreGuildFromBackup(
  guild: Guild,
  backupId?: number,
): Promise<{ rolesRestored: number; channelsRestored: number } | null> {
  const row = backupId
    ? await container.db.security.getBackup(backupId)
    : await container.db.security.getLatestBackup(guild.id);
  if (!row || row.guildId !== guild.id) return null;

  const data = row.data as unknown as GuildBackupData;
  let rolesRestored = 0;
  const roleIdMap = new Map<string, string>();

  for (const role of data.roles) {
    if (guild.roles.cache.has(role.id)) {
      roleIdMap.set(role.id, role.id);
      continue;
    }
    try {
      const created = await guild.roles.create({
        name: role.name,
        color: role.color,
        permissions: BigInt(role.permissions),
        hoist: role.hoist,
        mentionable: role.mentionable,
        position: role.position,
        reason: "Security: restoring from backup",
      });
      roleIdMap.set(role.id, created.id);
      rolesRestored++;
    } catch (err: unknown) {
      container.logger.warn(
        `[security] Restore: failed to recreate role ${role.name} in ${guild.id}: ${String(err)}`,
      );
    }
  }

  let channelsRestored = 0;
  // Categories first so child channels can resolve `parentId`.
  const ordered = [...data.channels].sort((a, b) =>
    a.type === ChannelType.GuildCategory ? -1 : b.type === ChannelType.GuildCategory ? 1 : 0,
  );
  const channelIdMap = new Map<string, string>();

  for (const channel of ordered) {
    if (guild.channels.cache.has(channel.id)) {
      channelIdMap.set(channel.id, channel.id);
      continue;
    }
    try {
      const parentId = channel.parentId
        ? (channelIdMap.get(channel.parentId) ??
            guild.channels.cache.get(channel.parentId)?.id ??
            null)
        : null;
      const created = await guild.channels.create({
        name: channel.name,
        type: channel.type as never,
        parent: parentId,
        position: channel.position,
        permissionOverwrites: channel.overwrites.map((ow) => ({
          id: roleIdMap.get(ow.id) ?? ow.id,
          type: ow.type,
          allow: BigInt(ow.allow),
          deny: BigInt(ow.deny),
        })),
        reason: "Security: restoring from backup",
      });
      channelIdMap.set(channel.id, (created as { id: string }).id);
      channelsRestored++;
    } catch (err: unknown) {
      container.logger.warn(
        `[security] Restore: failed to recreate channel ${channel.name} in ${guild.id}: ${String(err)}`,
      );
    }
  }

  return { rolesRestored, channelsRestored };
}
