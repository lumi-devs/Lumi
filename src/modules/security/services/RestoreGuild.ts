import { container } from "#src/lib/Services.js";
import { ChannelType } from "discord.js";
import {
  Routes,
  type APIRole,
  type RESTPatchAPIGuildRolePositionsJSONBody,
  type RESTPostAPIGuildChannelJSONBody,
  type RESTPostAPIGuildRoleJSONBody,
} from "discord-api-types/v10";
import type { GuildBackupData } from "#src/modules/security/data/BackupTypes.js";
import {
  fetchGuildChannelsRestUncached,
  fetchGuildRolesRestUncached,
} from "#src/lib/rpc/DiscordRestLookup.js";

interface LocalRoleOrder {
  id: string;
  position: number;
}

function sortRoleOrder(roles: LocalRoleOrder[]): LocalRoleOrder[] {
  return [...roles].sort(
    (a, b) => a.position - b.position || Number(BigInt(b.id) - BigInt(a.id)),
  );
}

function moveToAbsolutePosition(order: LocalRoleOrder[], id: string, newIndex: number): LocalRoleOrder[] {
  const index = order.findIndex((r) => r.id === id);
  if (index === -1 || newIndex <= -1 || newIndex >= order.length) return order;
  const [moved] = order.splice(index, 1);
  order.splice(newIndex, 0, moved as LocalRoleOrder);
  return order;
}

async function createRoleWithPosition(
  guildId: string,
  body: RESTPostAPIGuildRoleJSONBody,
  position: number,
  currentOrder: LocalRoleOrder[],
  reason: string,
): Promise<{ role: APIRole; order: LocalRoleOrder[] }> {
  const role = (await container.client.rest.post(Routes.guildRoles(guildId), {
    body,
    reason,
  })) as APIRole;

  let order = [...currentOrder, { id: role.id, position: currentOrder.length }];
  order = sortRoleOrder(order);
  order = moveToAbsolutePosition(order, role.id, position);
  order = order.map((entry, index) => ({ id: entry.id, position: index }));

  const patchBody: RESTPatchAPIGuildRolePositionsJSONBody = order.map((entry) => ({
    id: entry.id,
    position: entry.position,
  }));
  await container.client.rest.patch(Routes.guildRoles(guildId), {
    body: patchBody,
    reason,
  });

  return { role, order };
}

export async function restoreGuildFromBackup(
  guildId: string,
  backupId?: number,
): Promise<{ rolesRestored: number; channelsRestored: number } | null> {
  const row = backupId
    ? await container.db.security.getBackup(backupId)
    : await container.db.security.getLatestBackup(guildId);
  if (!row || row.guildId !== guildId) return null;

  const data = row.data as unknown as GuildBackupData;
  let rolesRestored = 0;
  const roleIdMap = new Map<string, string>();

  const existingRoles = (await fetchGuildRolesRestUncached(guildId)) ?? [];
  const existingRoleIds = new Set(existingRoles.map((role) => role.id));
  let roleOrder: LocalRoleOrder[] = sortRoleOrder(
    existingRoles.map((role) => ({ id: role.id, position: role.position })),
  );

  for (const role of data.roles) {
    if (existingRoleIds.has(role.id)) {
      roleIdMap.set(role.id, role.id);
      continue;
    }
    try {
      const body: RESTPostAPIGuildRoleJSONBody = {
        name: role.name,
        color: role.color,
        permissions: role.permissions,
        hoist: role.hoist,
        mentionable: role.mentionable,
      };
      const { role: created, order } = await createRoleWithPosition(
        guildId,
        body,
        role.position,
        roleOrder,
        "Security: restoring from backup",
      );
      roleOrder = order;
      roleIdMap.set(role.id, created.id);
      rolesRestored++;
    } catch (err: unknown) {
      container.logger.warn(
        `[security] Restore: failed to recreate role ${role.name} in ${guildId}: ${String(err)}`,
      );
    }
  }

  let channelsRestored = 0;

  const ordered = [...data.channels].sort((a, b) =>
    a.type === ChannelType.GuildCategory ? -1 : b.type === ChannelType.GuildCategory ? 1 : 0,
  );
  const channelIdMap = new Map<string, string>();
  const existingChannels = (await fetchGuildChannelsRestUncached(guildId)) ?? [];
  const existingChannelIds = new Set(existingChannels.map((channel) => channel.id));

  for (const channel of ordered) {
    if (existingChannelIds.has(channel.id)) {
      channelIdMap.set(channel.id, channel.id);
      continue;
    }
    try {
      const parentId = channel.parentId
        ? (channelIdMap.get(channel.parentId) ??
            (existingChannelIds.has(channel.parentId) ? channel.parentId : null))
        : null;
      const body: RESTPostAPIGuildChannelJSONBody = {
        name: channel.name,
        type: channel.type as never,
        parent_id: parentId,
        position: channel.position,
        permission_overwrites: channel.overwrites.map((ow) => ({
          id: roleIdMap.get(ow.id) ?? ow.id,
          type: ow.type,
          allow: ow.allow,
          deny: ow.deny,
        })),
      };
      const created = await container.client.rest.post(Routes.guildChannels(guildId), {
        body,
        reason: "Security: restoring from backup",
      });
      channelIdMap.set(channel.id, (created as { id: string }).id);
      channelsRestored++;
    } catch (err: unknown) {
      container.logger.warn(
        `[security] Restore: failed to recreate channel ${channel.name} in ${guildId}: ${String(err)}`,
      );
    }
  }

  return { rolesRestored, channelsRestored };
}
