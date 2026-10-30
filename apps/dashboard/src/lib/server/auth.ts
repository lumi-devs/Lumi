import { error, redirect, type RequestEvent } from "@sveltejs/kit";
import type { GuildAccess } from "./types";
import {
  canManageGuild,
  DiscordError,
  fetchUserGuilds,
  refreshOAuthToken,
  type GuildSummary,
} from "./discord";
import { saveSession, type SessionRecord } from "./session";

export function requireSession(event: RequestEvent): SessionRecord {
  if (!event.locals.session) {
    const next = encodeURIComponent(event.url.pathname + event.url.search);
    throw redirect(303, `/auth/login?returnTo=${next}`);
  }
  return event.locals.session;
}

export function guildAccessFromSummary(guild: GuildSummary): GuildAccess {
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
    owner: Boolean(guild.owner),
    permissions: guild.permissions ?? "0",
  };
}

async function validAccessToken(event: RequestEvent): Promise<string> {
  const session = requireSession(event);
  if (session.tokenExpiresAt > Date.now() + 30_000) {
    return session.accessToken;
  }
  if (!session.refreshToken) {
    throw redirect(303, "/auth/login?error=expired");
  }

  try {
    const token = await refreshOAuthToken(session.refreshToken);
    const updated: SessionRecord = {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      tokenExpiresAt: Date.now() + token.expires_in * 1000,
    };
    if (event.locals.sessionId)
      await saveSession(event.locals.sessionId, updated);
    event.locals.session = updated;
    return updated.accessToken;
  } catch (refreshError) {
    console.warn("[dashboard] oauth refresh failed", refreshError);
    throw redirect(303, "/auth/login?error=expired");
  }
}

export async function manageableGuilds(
  event: RequestEvent,
): Promise<GuildAccess[]> {
  if (event.locals.guildCache) {
    return Array.from(event.locals.guildCache.values());
  }

  const token = await validAccessToken(event);
  let guilds: GuildSummary[];
  try {
    guilds = await fetchUserGuilds(token);
  } catch (fetchError) {
    if (
      fetchError instanceof DiscordError &&
      (fetchError.status === 401 || fetchError.status === 403)
    ) {
      throw redirect(303, "/auth/login?error=expired");
    }
    throw fetchError;
  }

  const cache = new Map<string, GuildAccess>();
  for (const guild of guilds) {
    if (canManageGuild(guild)) {
      cache.set(guild.id, guildAccessFromSummary(guild));
    }
  }
  event.locals.guildCache = cache;
  return Array.from(cache.values());
}

export async function requireGuildAccess(
  event: RequestEvent,
  guildId: string,
): Promise<GuildAccess> {
  if (!/^\d{16,22}$/.test(guildId)) {
    throw error(404, "Server not found.");
  }

  requireSession(event);
  if (!event.locals.guildCache) await manageableGuilds(event);
  const guild = event.locals.guildCache?.get(guildId);
  if (!guild) {
    throw error(
      403,
      "You do not have Manage Server in this server, or the server is unavailable.",
    );
  }
  return guild;
}
