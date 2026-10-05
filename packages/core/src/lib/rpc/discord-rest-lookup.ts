import { container } from "@sapphire/framework";
import { ChannelType, PermissionsBitField, RESTJSONErrorCodes } from "discord.js";
import { calculateUserDefaultAvatarIndex } from "@discordjs/rest";
import {
  Routes,
  type APIChannel,
  type APIGuild,
  type APIGuildMember,
  type APIMessage,
  type APIRole,
} from "discord-api-types/v10";
import { ValkeyKeys, ValkeyTTL } from "#lib/database/valkey.js";
import { authorize } from "#lib/permissions/authorize.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { swallow } from "#lib/utilities/errors.js";

/**
 * Guild/member/channel reads for RPC authorization, sourced from Discord's
 * REST API rather than the gateway cache: RPC handlers run on whichever
 * shard is primary, but the gateway only caches guilds that shard itself
 * owns, so REST is the only lookup that works regardless of which shard (or,
 * eventually, a gateway-less API process) is asking. Short Valkey TTLs mirror
 * the staleness the dashboard's own session cache already tolerates.
 */

async function fetchGuildRest(guildId: string): Promise<APIGuild | null> {
  return repositoryCache.getOrLoad<APIGuild | null>(
    ValkeyKeys.restGuild(guildId),
    ValkeyTTL.restGuild * 1000,
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
    ValkeyKeys.restMember(guildId, userId),
    ValkeyTTL.restMember * 1000,
    () =>
      container.client.rest.get(
        Routes.guildMember(guildId, userId),
      ) as Promise<APIGuildMember>,
    (data) => JSON.parse(data) as APIGuildMember,
  ).catch(swallow("discord-rest-lookup: member fetch failed"));
}

/**
 * True only for a Discord response that confirms the resource genuinely
 * doesn't exist (a 404, or the curated "Unknown Guild"/"Unknown Member" JSON
 * error codes) - never for a 5xx, a network failure, or a rate limit, which
 * must propagate instead of being silently treated as "not found". Checked
 * structurally (`.code`/`.status`, the shape both `DiscordAPIError` and
 * `HTTPError` from `@discordjs/rest` carry) rather than with `instanceof`,
 * since `discord.js` re-exports those classes from its own module scope and
 * a REST client swapped in for tests won't reject with that same identity.
 */
function isConfirmedAbsent(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, status } = err as { code?: unknown; status?: unknown };
  if (status === 404) return true;
  return (
    code === RESTJSONErrorCodes.UnknownGuild ||
    code === RESTJSONErrorCodes.UnknownMember
  );
}

/**
 * Uncached counterpart of {@linkcode fetchGuildRest}, for callers where the
 * 20s cache-aside TTL is actively wrong rather than merely stale-tolerant:
 * a read that then feeds a full-replace PATCH (lost-update risk) or an
 * authorization decision (a just-revoked permission staying valid for up to
 * 20s). Same shape as {@linkcode fetchChannelMessageRest}'s existing
 * uncached precedent. Routed through `container.discordRest` (rather than
 * `container.client.rest` directly) so this - and the `checkGuildManagerRest`
 * authorizer it backs - can be tested against a fake instead of a mocked
 * REST client.
 */
async function fetchGuildRestUncached(guildId: string): Promise<APIGuild | null> {
  return container.discordRest.fetchGuild(guildId);
}

/** Uncached counterpart of {@linkcode fetchGuildMemberRest} - see {@linkcode fetchGuildRestUncached}. */
async function fetchGuildMemberRestUncached(
  guildId: string,
  userId: string,
): Promise<APIGuildMember | null> {
  return container.discordRest.fetchMember(guildId, userId);
}

export async function fetchChannelRest(channelId: string): Promise<APIChannel | null> {
  return repositoryCache.getOrLoad<APIChannel | null>(
    ValkeyKeys.restChannel(channelId),
    ValkeyTTL.restChannel * 1000,
    () => container.client.rest.get(Routes.channel(channelId)) as Promise<APIChannel>,
    (data) => JSON.parse(data) as APIChannel,
  ).catch(swallow("discord-rest-lookup: channel fetch failed"));
}

/**
 * A single message by id, deliberately uncached: callers use this to decide
 * whether to edit an existing message or post a fresh one (the verification
 * panel), so a short-TTL cache-aside snapshot that could still say "found"
 * seconds after a real delete would be actively wrong here.
 */
export async function fetchChannelMessageRest(
  channelId: string,
  messageId: string,
): Promise<APIMessage | null> {
  return (
    container.client.rest.get(
      Routes.channelMessage(channelId, messageId),
    ) as Promise<APIMessage>
  ).catch(() => null);
}

/** Mirrors discord.js's own `GuildTextBasedChannelTypes` - the channel types a message can be sent to, edited in, or deleted from. */
export const GuildTextBasedChannelTypes = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

export async function fetchGuildRolesRest(guildId: string): Promise<APIRole[] | null> {
  return repositoryCache.getOrLoad<APIRole[] | null>(
    ValkeyKeys.restGuildRoles(guildId),
    ValkeyTTL.restGuildRoles * 1000,
    () => container.client.rest.get(Routes.guildRoles(guildId)) as Promise<APIRole[]>,
    (data) => JSON.parse(data) as APIRole[],
  ).catch(swallow("discord-rest-lookup: guild roles fetch failed"));
}

export async function fetchGuildChannelsRest(guildId: string): Promise<APIChannel[] | null> {
  return repositoryCache.getOrLoad<APIChannel[] | null>(
    ValkeyKeys.restGuildChannels(guildId),
    ValkeyTTL.restGuildChannels * 1000,
    () => container.client.rest.get(Routes.guildChannels(guildId)) as Promise<APIChannel[]>,
    (data) => JSON.parse(data) as APIChannel[],
  ).catch(swallow("discord-rest-lookup: guild channels fetch failed"));
}

/**
 * Uncached counterparts of {@linkcode fetchGuildRolesRest}/
 * {@linkcode fetchGuildChannelsRest}, for a restore operation's "does this
 * already exist" checks: the same restore call creates roles/channels as it
 * goes, so no TTL-based cache can stay correct mid-operation, and a stale
 * hit on a retried restore would recreate duplicates. See
 * {@linkcode fetchGuildRestUncached}.
 */
export async function fetchGuildRolesRestUncached(guildId: string): Promise<APIRole[] | null> {
  return (
    container.client.rest.get(Routes.guildRoles(guildId)) as Promise<APIRole[]>
  ).catch((err: unknown) => {
    if (isConfirmedAbsent(err)) return null;
    throw err;
  });
}

export async function fetchGuildChannelsRestUncached(
  guildId: string,
): Promise<APIChannel[] | null> {
  return (
    container.client.rest.get(Routes.guildChannels(guildId)) as Promise<APIChannel[]>
  ).catch((err: unknown) => {
    if (isConfirmedAbsent(err)) return null;
    throw err;
  });
}

/**
 * One page of up to `limit` members (Discord's own id-ascending order), not the full paginated
 * roster: the dashboard only ever needed a bounded sample for a member picker, and looping the
 * paginated `GET /guilds/{id}/members` endpoint to reconstruct "the whole cache" would be far
 * more rate-limit-heavy than the gateway-cache read this replaces.
 */
export async function fetchGuildMembersSampleRest(
  guildId: string,
  limit: number,
): Promise<APIGuildMember[] | null> {
  return repositoryCache.getOrLoad<APIGuildMember[] | null>(
    ValkeyKeys.restGuildMembersSample(guildId, limit),
    ValkeyTTL.restGuildMembersSample * 1000,
    () =>
      container.client.rest.get(Routes.guildMembers(guildId), {
        query: new URLSearchParams({ limit: String(limit) }),
      }) as Promise<APIGuildMember[]>,
    (data) => JSON.parse(data) as APIGuildMember[],
  ).catch(swallow("discord-rest-lookup: guild members sample fetch failed"));
}

/** The bot's own member row, e.g. to find its highest role for an "is this the bot's role" flag. */
export async function fetchBotMemberRest(guildId: string): Promise<APIGuildMember | null> {
  const botId = container.client.user?.id;
  if (!botId) return null;
  return fetchGuildMemberRest(guildId, botId);
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

async function isGuildManager(actorId: string, guildId: string, memberPermissions: PermissionsBitField): Promise<boolean> {
  return authorize({ userId: actorId, guildId, memberPermissions }, { kind: "guildManager" });
}

export interface RestGuildManagerCheck {
  guild: APIGuild;
  isManager: boolean;
}

/**
 * REST equivalent of `cachedGuild(guildId).members.fetch(actorId)` +
 * permission check. Returns `null` for "guild not found" so the caller can
 * throw the same `GuildNotFound` error the old gateway-cache miss threw.
 *
 * Backs the `guildManager` RPC authorizer that gates every dashboard
 * mutation - this is an authorization gate, not a display-staleness case, so
 * both reads deliberately bypass the 20s cache-aside every other REST read
 * here tolerates: pre-refactor this read the gateway member cache, updated
 * near-real-time by `GUILD_MEMBER_UPDATE`, and a stale hit here would let a
 * just-revoked manager keep privileged access for up to 20s.
 */
export async function checkGuildManagerRest(
  guildId: string,
  actorId: string,
): Promise<RestGuildManagerCheck | null> {
  const guild = await fetchGuildRestUncached(guildId);
  if (!guild) return null;

  if (guild.owner_id === actorId) return { guild, isManager: true };

  const member = await fetchGuildMemberRestUncached(guildId, actorId);
  if (!member) return { guild, isManager: false };

  const permissions = computeGuildPermissions(guild, member);
  return { guild, isManager: await isGuildManager(actorId, guildId, permissions) };
}

export function guildIconUrl(guild: Pick<APIGuild, "id" | "icon">): string | null {
  return guild.icon ? container.client.rest.cdn.icon(guild.id, guild.icon) : null;
}

export function guildBannerUrl(guild: Pick<APIGuild, "id" | "banner">): string | null {
  return guild.banner ? container.client.rest.cdn.banner(guild.id, guild.banner) : null;
}

/** Mirrors discord.js's `GuildMember#displayAvatarURL()` fallback order: guild-specific avatar, then the user's own, then the default. */
export function memberAvatarUrl(
  guildId: string,
  member: Pick<APIGuildMember, "avatar" | "user">,
): string {
  const cdn = container.client.rest.cdn;
  if (member.avatar) return cdn.guildMemberAvatar(guildId, member.user.id, member.avatar);
  if (member.user.avatar) return cdn.avatar(member.user.id, member.user.avatar);
  return cdn.defaultAvatar(calculateUserDefaultAvatarIndex(member.user.id));
}

export {
  fetchGuildRest,
  fetchGuildMemberRest,
  fetchGuildRestUncached,
  fetchGuildMemberRestUncached,
};
