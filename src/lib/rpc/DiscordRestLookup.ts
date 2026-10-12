import { container } from "#src/lib/Services.js";
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
import { ValkeyKeys, ValkeyTTL } from "#src/lib/valkey/Client.js";
import { authorize } from "#src/lib/api/permissions/Authorize.js";
import { repositoryCache } from "#src/lib/cache/CacheStore.js";
import { swallow } from "#src/lib/utilities/Errors.js";

export async function fetchGuildRest(guildId: string): Promise<APIGuild | null> {
  const cached = container.client?.guilds?.cache?.get(guildId);
  if (cached) {
    return {
      id: cached.id,
      name: cached.name,
      icon: cached.icon,
      banner: cached.banner,
      approximate_member_count: cached.memberCount ?? 0,
      roles: Array.from(cached.roles?.cache?.values() ?? []).map((r) => ("toJSON" in r ? (r as any).toJSON() : r)),
    } as unknown as APIGuild;
  }

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

export async function fetchGuildMemberRest(
  guildId: string,
  userId: string,
): Promise<APIGuildMember | null> {
  const cachedMember = container.client?.guilds?.cache?.get(guildId)?.members?.cache?.get(userId);
  if (cachedMember && "toJSON" in cachedMember) {
    return (cachedMember as any).toJSON() as APIGuildMember;
  }

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

function isConfirmedAbsent(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, status } = err as { code?: unknown; status?: unknown };
  if (status === 404) return true;
  return (
    code === RESTJSONErrorCodes.UnknownGuild ||
    code === RESTJSONErrorCodes.UnknownMember
  );
}

export async function fetchGuildRestUncached(guildId: string): Promise<APIGuild | null> {
  return container.discordRest.fetchGuild(guildId);
}

export async function fetchGuildMemberRestUncached(
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

export async function fetchBotMemberRest(guildId: string): Promise<APIGuildMember | null> {
  const botId = container.client.user?.id;
  if (!botId) return null;
  return fetchGuildMemberRest(guildId, botId);
}

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

export function memberAvatarUrl(
  guildId: string,
  member: Pick<APIGuildMember, "avatar" | "user">,
): string {
  const cdn = container.client.rest.cdn;
  if (member.avatar) return cdn.guildMemberAvatar(guildId, member.user.id, member.avatar);
  if (member.user.avatar) return cdn.avatar(member.user.id, member.user.avatar);
  return cdn.defaultAvatar(calculateUserDefaultAvatarIndex(member.user.id));
}
