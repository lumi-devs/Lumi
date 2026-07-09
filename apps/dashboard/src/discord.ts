import { config } from "./config.js";
import type { OAuthGuild } from "./types.js";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_CDN = "https://cdn.discordapp.com";
const MANAGE_GUILD = 0x20n;
const OAUTH_SCOPES = "identify guilds";

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
  discriminator?: string;
}

/** Build the Discord authorization URL for the login redirect. */
export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: OAUTH_SCOPES,
    redirect_uri: config.redirectUri,
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Exchange an authorization code for an access token. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Token exchange returned no token");
  return json.access_token;
}

async function bearerGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord API ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

export function getUser(accessToken: string): Promise<DiscordUser> {
  return bearerGet<DiscordUser>("/users/@me", accessToken);
}

export function getUserGuilds(accessToken: string): Promise<OAuthGuild[]> {
  return bearerGet<OAuthGuild[]>("/users/@me/guilds", accessToken);
}

/** True when the OAuth guild entry grants Manage Server (or ownership). */
export function canManage(guild: OAuthGuild): boolean {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

export function userAvatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `${DISCORD_CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
  }
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}

export function guildIconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `${DISCORD_CDN}/icons/${id}/${icon}.${ext}?size=64`;
}
