import { fetchGuildChannels, fetchGuildRoles } from "./discord";

type TargetId = string | null | undefined;

export interface GuildTargetRequest {
  channels?: Iterable<TargetId>;
  roles?: Iterable<TargetId>;
}

export type GuildTargetResult =
  { ok: true } | { ok: false; status: 400 | 502; message: string };

function uniqueIds(values: Iterable<TargetId> | undefined): string[] {
  if (!values) return [];
  return Array.from(
    new Set(
      Array.from(values).filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function verifyGuildTargets(
  guildId: string,
  request: GuildTargetRequest,
): Promise<GuildTargetResult> {
  const channelIds = uniqueIds(request.channels);
  const roleIds = uniqueIds(request.roles);
  if (channelIds.length === 0 && roleIds.length === 0) return { ok: true };

  let channels: Awaited<ReturnType<typeof fetchGuildChannels>>;
  let roles: Awaited<ReturnType<typeof fetchGuildRoles>>;
  try {
    [channels, roles] = await Promise.all([
      channelIds.length > 0 ? fetchGuildChannels(guildId) : [],
      roleIds.length > 0 ? fetchGuildRoles(guildId) : [],
    ]);
  } catch {
    return {
      ok: false,
      status: 502,
      message:
        "Could not verify Discord channels and roles. Check the bot connection and retry.",
    };
  }

  const knownChannels = new Set(channels.map((channel) => channel.id));
  if (channelIds.some((id) => !knownChannels.has(id))) {
    return {
      ok: false,
      status: 400,
      message: "Choose channels that belong to this server.",
    };
  }

  const knownRoles = new Set(roles.map((role) => role.id));
  if (roleIds.some((id) => !knownRoles.has(id))) {
    return {
      ok: false,
      status: 400,
      message: "Choose roles that belong to this server.",
    };
  }

  return { ok: true };
}
