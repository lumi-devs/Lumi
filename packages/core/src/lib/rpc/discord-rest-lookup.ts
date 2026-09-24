import { container } from "@sapphire/framework";
import { PermissionsBitField } from "discord.js";
import { Routes, type APIChannel, type APIGuild, type APIGuildMember } from "discord-api-types/v10";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { swallow } from "#lib/utilities/errors.js";

/**
 * Guild/member/channel reads for RPC authorization, sourced from Discord's
 * REST API rather than the gateway cache: RPC handlers run on whichever
 * shard is primary, but the gateway only caches guilds that shard itself
 * owns, so REST is the only lookup that works regardless of which shard (or,
 * eventually, a gateway-less API process) is asking. Short Redis TTLs mirror
 * the staleness the dashboard's own session cache already tolerates.
 */

async function fetchGuildRest(guildId: string): Promise<APIGuild | null> {
  return repositoryCache.getOrLoad<APIGuild | null>(
    RedisKeys.restGuild(guildId),
    RedisTTL.restGuild * 1000,
    () =>
      container.client.rest.get(Routes.guild(guildId), {
        query: new URLSearchParams({ with_counts: "true" }),
      }) as Promise<APIGuild>,
    (data) => JSON.parse(data) as APIGuild,
  ).catch(swallow("discord-rest-lookup: guild fetch failed"));
}

async function fetchGuildMemberRest(
  guildId: string,
  userId: string,
): Promise<APIGuildMember | null> {
  return repositoryCache.getOrLoad<APIGuildMember | null>(
    RedisKeys.restMember(guildId, userId),
    RedisTTL.restMember * 1000,
    () =>
      container.client.rest.get(
        Routes.guildMember(guildId, userId),
      ) as Promise<APIGuildMember>,
    (data) => JSON.parse(data) as APIGuildMember,
  ).catch(swallow("discord-rest-lookup: member fetch failed"));
}

export async function fetchChannelRest(channelId: string): Promise<APIChannel | null> {
  return repositoryCache.getOrLoad<APIChannel | null>(
    RedisKeys.restChannel(channelId),
    RedisTTL.restChannel * 1000,
    () => container.client.rest.get(Routes.channel(channelId)) as Promise<APIChannel>,
    (data) => JSON.parse(data) as APIChannel,
  ).catch(swallow("discord-rest-lookup: channel fetch failed"));
}

/** Sums the `@everyone` role plus every role the member holds - same algorithm discord.js's own `GuildMember.permissions` uses, minus channel overwrites (irrelevant for a guild-level check like ManageGuild). */
function computeGuildPermissions(guild: APIGuild, member: APIGuildMember): PermissionsBitField {
  const memberRoleIds = new Set(member.roles);
  let bits = 0n;
  for (const role of guild.roles) {
    if (role.id === guild.id || memberRoleIds.has(role.id)) {
      bits |= BigInt(role.permissions);
    }
  }
  return new PermissionsBitField(bits);
}

export interface RestGuildManagerCheck {
  guild: APIGuild;
  isManager: boolean;
}

/**
 * REST equivalent of `cachedGuild(guildId).members.fetch(actorId)` +
 * permission check. Returns `null` for "guild not found" so the caller can
 * throw the same `GuildNotFound` error the old gateway-cache miss threw.
 */
export async function checkGuildManagerRest(
  guildId: string,
  actorId: string,
): Promise<RestGuildManagerCheck | null> {
  const guild = await fetchGuildRest(guildId);
  if (!guild) return null;

  if (guild.owner_id === actorId) return { guild, isManager: true };

  const member = await fetchGuildMemberRest(guildId, actorId);
  if (!member) return { guild, isManager: false };

  const permissions = computeGuildPermissions(guild, member);
  const isManager =
    permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    permissions.has(PermissionsBitField.Flags.Administrator);
  return { guild, isManager };
}

export function guildIconUrl(guild: Pick<APIGuild, "id" | "icon">): string | null {
  return guild.icon ? container.client.rest.cdn.icon(guild.id, guild.icon) : null;
}

export function guildBannerUrl(guild: Pick<APIGuild, "id" | "banner">): string | null {
  return guild.banner ? container.client.rest.cdn.banner(guild.id, guild.banner) : null;
}

export { fetchGuildRest };
