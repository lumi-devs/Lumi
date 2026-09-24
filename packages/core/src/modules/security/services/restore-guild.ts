import { container } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import {
  Routes,
  type APIRole,
  type RESTPatchAPIGuildRolePositionsJSONBody,
  type RESTPostAPIGuildChannelJSONBody,
  type RESTPostAPIGuildRoleJSONBody,
} from "discord-api-types/v10";
import type { GuildBackupData } from "./backup-types.js";
import { fetchGuildChannelsRest, fetchGuildRolesRest } from "#lib/rpc/discord-rest-lookup.js";

interface LocalRoleOrder {
  id: string;
  position: number;
}

/**
 * Mirrors discord.js's `discordSort` for roles (`RoleManager`/`Guild#_sortedRoles`):
 * ascending by position, ties broken by descending snowflake (newest first).
 */
function sortRoleOrder(roles: LocalRoleOrder[]): LocalRoleOrder[] {
  return [...roles].sort(
    (a, b) => a.position - b.position || Number(BigInt(b.id) - BigInt(a.id)),
  );
}

/** Mirrors discord.js's `moveElementInArray` with `relative: false` (absolute index). */
function moveToAbsolutePosition(order: LocalRoleOrder[], id: string, newIndex: number): LocalRoleOrder[] {
  const index = order.findIndex((r) => r.id === id);
  if (index === -1 || newIndex <= -1 || newIndex >= order.length) return order;
  const [moved] = order.splice(index, 1);
  order.splice(newIndex, 0, moved as LocalRoleOrder);
  return order;
}

/**
 * Discord's "Create Guild Role" endpoint never accepts a position - new roles
 * always land just above `@everyone` - so discord.js's `RoleManager#create()`
 * follows up a create with a full role-list reorder via
 * `PATCH /guilds/{id}/roles` when a `position` is requested
 * (see `RoleManager#create`/`#setPosition`, `Util#setPosition`). Both requests
 * are awaited sequentially inside the same call, so a failure at either step
 * must fail the whole role restore the same way the caller's try/catch
 * already expects.
 */
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

/**
 * Recreates roles and channels present in the snapshot but missing from
 * the guild now. Best-effort: exact position/id can't be preserved (a
 * recreated role/channel gets a new Discord id), only name, permissions,
 * hierarchy-adjacent position, and (for channels) parent + overwrites.
 *
 * Discord mutations go through raw REST routes (`container.client.rest`)
 * rather than the gateway-cached `Guild`'s convenience methods, so this can
 * run on a shard/process that doesn't own this guild's gateway connection -
 * as can the existence checks (`fetchGuildRolesRest`/`fetchGuildChannelsRest`),
 * also REST-sourced rather than `guild.roles.cache`/`guild.channels.cache`.
 */
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

  const existingRoles = (await fetchGuildRolesRest(guildId)) ?? [];
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
  // Categories first so child channels can resolve `parentId`.
  const ordered = [...data.channels].sort((a, b) =>
    a.type === ChannelType.GuildCategory ? -1 : b.type === ChannelType.GuildCategory ? 1 : 0,
  );
  const channelIdMap = new Map<string, string>();
  const existingChannels = (await fetchGuildChannelsRest(guildId)) ?? [];
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
